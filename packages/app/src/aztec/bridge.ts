/**
 * ───────────────────────────────────────────────────────────────────────────────────
 *  TEMPORARY, SELF-CONTAINED bridging shim — slated for replacement by an upstreamed
 *  Aztec bridge widget. Keep all L1-bridging concerns inside this module so swapping it
 *  out later touches nothing else. The rest of the app only imports
 *  `bridgeFeeJuiceToFpc` + `BridgeStatus`.
 * ───────────────────────────────────────────────────────────────────────────────────
 *
 * Bridges Fee Juice from L1 into the PrivateFeeJuice FPC so a visitor can fund their
 * first vote (`fee_entrypoint_with_topup`). The visitor connects a real L1 wallet —
 * discovered via EIP-6963 (`mipd`), which is the robust replacement for racing the raw
 * `window.ethereum` — and pays only a little Sepolia ETH for gas; the Fee Juice itself is
 * minted by the testnet faucet handler (`bridgeTokensPublic(.., mint=true)`).
 *
 * Minimal, modern stack: `viem` + `mipd` (both by wevm) + `@aztec/aztec.js/*`. No
 * `@aztec/ethereum/*`, no wagmi — keeps the shim small and the install clean.
 */
import { createStore as createMipdStore } from "mipd";
import { sepolia } from "viem/chains";
import { createWalletClient, custom, publicActions } from "viem";
import type { EIP1193Provider } from "viem";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { isL1ToL2MessageReady } from "@aztec/aztec.js/messaging";
import { Fr } from "@aztec/aztec.js/fields";
import { createLogger } from "@aztec/foundation/log";
import type { AztecNode } from "@aztec/aztec.js/node";
import type { AztecAddress } from "@aztec/aztec.js/addresses";

import type { FeeJuiceClaim } from "./private_fee_juice_payment.ts";

/** Coarse phases the widget renders so the (multi-minute) bridge never looks frozen. */
export type BridgeStatus =
  | { phase: "connecting-wallet" }
  | { phase: "switching-chain" }
  | { phase: "bridging" } // minting + approving + depositing on L1
  | { phase: "waiting-message"; elapsedSeconds: number }
  | { phase: "ready" };

export interface BridgeParams {
  node: AztecNode;
  /** L1 chain id (from `node.getNodeInfo().l1ChainId`); only Sepolia is supported today. */
  l1ChainId: number;
  /** The FPC address the claim must be destined for. */
  fpcAddress: AztecAddress;
  onStatus?: (status: BridgeStatus) => void;
}

const MESSAGE_POLL_INTERVAL_MS = 5_000;
const MESSAGE_TIMEOUT_MS = 20 * 60_000;

// EIP-6963 wallet discovery store, created once. Wallets announce themselves to it, so we
// get concrete providers instead of racing a single `window.ethereum`.
const mipdStore = createMipdStore();

function assertSepolia(l1ChainId: number): void {
  if (l1ChainId !== sepolia.id) {
    throw new Error(
      `Unsupported L1 chain ${l1ChainId}; the bridge currently supports Sepolia (${sepolia.id}) only.`,
    );
  }
}

/**
 * Picks an injected L1 wallet: the first EIP-6963 provider if any announced, else the
 * legacy `window.ethereum`. (A contained shim — a fuller version would let the user
 * choose among `mipdStore.getProviders()`.)
 */
function pickL1Provider(): EIP1193Provider {
  const [announced] = mipdStore.getProviders();
  if (announced) return announced.provider as EIP1193Provider;
  const injected = (globalThis as { ethereum?: EIP1193Provider }).ethereum;
  if (injected) return injected;
  throw new Error(
    "No L1 wallet found. Install a browser wallet (e.g. MetaMask) on Sepolia to fund your vote.",
  );
}

/**
 * Bridges the faucet's Fee Juice amount to `fpcAddress` and resolves once the L1→L2
 * message is consumable, returning the claim that `PrivateFeeJuiceTopupPaymentMethod`
 * feeds into `fee_entrypoint_with_topup`.
 */
export async function bridgeFeeJuiceToFpc(
  params: BridgeParams,
): Promise<FeeJuiceClaim> {
  const { node, l1ChainId, fpcAddress, onStatus } = params;
  assertSepolia(l1ChainId);

  // 1. Connect a real L1 wallet and build a viem client bound to it.
  onStatus?.({ phase: "connecting-wallet" });
  const provider = pickL1Provider();
  const [account] = (await provider.request({
    method: "eth_requestAccounts",
  })) as `0x${string}`[];
  if (!account) throw new Error("No L1 account authorized.");
  const walletClient = createWalletClient({
    account,
    chain: sepolia,
    transport: custom(provider),
  }).extend(publicActions);

  // 2. Make sure the wallet is on Sepolia.
  if ((await walletClient.getChainId()) !== sepolia.id) {
    onStatus?.({ phase: "switching-chain" });
    await walletClient.switchChain({ id: sepolia.id });
  }

  // 3. Mint (faucet) + approve + deposit on L1. The wallet client (extended with public
  //    actions) satisfies the portal manager's read+write needs over the wallet's own
  //    provider.
  onStatus?.({ phase: "bridging" });
  const portal = await L1FeeJuicePortalManager.new(
    node,
    // The portal manager only needs an account-bearing public+wallet viem client.
    walletClient as unknown as Parameters<typeof L1FeeJuicePortalManager.new>[1],
    createLogger("app:bridge"),
  );
  // amount=undefined → bridge exactly the faucet's mint amount; mint=true uses the handler.
  const claim = await portal.bridgeTokensPublic(fpcAddress, undefined, true);

  // 4. Wait for the message to land on L2 so the claim is consumable in the vote tx.
  const messageHash = Fr.fromHexString(claim.messageHash);
  const startedAt = Date.now();
  while (Date.now() - startedAt < MESSAGE_TIMEOUT_MS) {
    if (await isL1ToL2MessageReady(node, messageHash)) {
      onStatus?.({ phase: "ready" });
      return {
        claimAmount: BigInt(claim.claimAmount),
        claimSecret: claim.claimSecret,
        messageLeafIndex: BigInt(claim.messageLeafIndex),
      };
    }
    onStatus?.({
      phase: "waiting-message",
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
    await new Promise((r) => setTimeout(r, MESSAGE_POLL_INTERVAL_MS));
  }
  throw new Error("Timed out waiting for the bridged Fee Juice to arrive on L2.");
}

/** Human-readable one-liner for a bridge status, for the widget. */
export function describeBridgeStatus(status: BridgeStatus): string {
  switch (status.phase) {
    case "connecting-wallet":
      return "Connecting your L1 wallet…";
    case "switching-chain":
      return "Switching your wallet to Sepolia…";
    case "bridging":
      return "Bridging Fee Juice from L1 (confirm the wallet prompts)…";
    case "waiting-message":
      return `Waiting for Fee Juice to arrive on L2… (${status.elapsedSeconds}s)`;
    case "ready":
      return "Fee Juice ready — casting your vote.";
  }
}
