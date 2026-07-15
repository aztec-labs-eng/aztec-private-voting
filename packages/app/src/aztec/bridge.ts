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
 * minted by the testnet faucet handler.
 *
 * The three L1 steps (faucet mint → ERC20 approve → portal `depositToAztecPublic`) go out
 * as plain `eth_sendTransaction` calls through the injected wallet, via viem's
 * `writeContract`. We deliberately do NOT use `L1FeeJuicePortalManager`: it routes every
 * write through `L1TxUtils`, which signs locally (`eth_signTransaction` + raw send) — a
 * method injected wallets like MetaMask don't implement. The L1→L2 claim is derived the
 * same way it does: a random secret whose hash rides on the deposit, plus the message leaf
 * index read back from the `DepositToAztecPublic` event.
 *
 * Minimal, modern stack: `viem` + `mipd` (both by wevm) + `@aztec/aztec.js/*` +
 * `@aztec/l1-artifacts` (L1 ABIs).
 */
import { createStore as createMipdStore } from "mipd";
import { sepolia } from "viem/chains";
import {
  createWalletClient,
  custom,
  getContract,
  parseEventLogs,
  publicActions,
} from "viem";
import type { EIP1193Provider } from "viem";
import { isL1ToL2MessageReady } from "@aztec/aztec.js/messaging";
import { Fr } from "@aztec/aztec.js/fields";
import { computeSecretHash } from "@aztec/stdlib/hash";
import { FeeJuicePortalAbi } from "@aztec/l1-artifacts/FeeJuicePortalAbi";
import { FeeAssetHandlerAbi } from "@aztec/l1-artifacts/FeeAssetHandlerAbi";
import { TestERC20Abi } from "@aztec/l1-artifacts/TestERC20Abi";
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

  // 3. Mint (faucet) → approve → deposit on L1, each as an `eth_sendTransaction` the
  //    injected wallet signs (viem's `.write.*`). See the module header for why we drive
  //    these ourselves instead of via `L1FeeJuicePortalManager`.
  onStatus?.({ phase: "bridging" });
  const {
    l1ContractAddresses: {
      feeJuiceAddress,
      feeJuicePortalAddress,
      feeAssetHandlerAddress,
    },
  } = await node.getNodeInfo();
  if (feeJuicePortalAddress.isZero() || feeJuiceAddress.isZero()) {
    throw new Error("Fee Juice portal/token is not deployed on this L1.");
  }
  if (!feeAssetHandlerAddress || feeAssetHandlerAddress.isZero()) {
    throw new Error(
      "This network has no Fee Juice faucet handler to mint from.",
    );
  }
  const tokenAddress = feeJuiceAddress.toString() as `0x${string}`;
  const portalAddress = feeJuicePortalAddress.toString() as `0x${string}`;
  const handlerAddress = feeAssetHandlerAddress.toString() as `0x${string}`;
  const token = getContract({
    address: tokenAddress,
    abi: TestERC20Abi,
    client: walletClient,
  });
  const handler = getContract({
    address: handlerAddress,
    abi: FeeAssetHandlerAbi,
    client: walletClient,
  });
  const portal = getContract({
    address: portalAddress,
    abi: FeeJuicePortalAbi,
    client: walletClient,
  });

  // A fresh L1→L2 claim: the secret's hash rides on-chain with the deposit; the secret
  // itself is consumed later, in the vote tx, to claim the bridged balance.
  const claimSecret = Fr.random();
  const claimSecretHash = await computeSecretHash(claimSecret);

  // The faucet mints a fixed amount — that's exactly what we bridge.
  const amount = await handler.read.mintAmount();
  await walletClient.waitForTransactionReceipt({
    hash: await handler.write.mint([account]),
  });
  await walletClient.waitForTransactionReceipt({
    hash: await token.write.approve([portalAddress, amount]),
  });

  // `depositToAztecPublic` forwards into the rollup Inbox, whose frontier-tree insert
  // periodically costs far more gas than a point-in-time estimate (a completed subtree
  // cascades into many hashes + SSTOREs). Triple the estimate so the deposit doesn't
  // intermittently run out of gas mid-insert; unused gas is refunded.
  const depositArgs = [
    fpcAddress.toString() as `0x${string}`,
    amount,
    claimSecretHash.toString() as `0x${string}`,
  ] as const;
  const gas =
    (await portal.estimateGas.depositToAztecPublic(depositArgs, { account })) *
    3n;
  const receipt = await walletClient.waitForTransactionReceipt({
    hash: await portal.write.depositToAztecPublic(depositArgs, { gas }),
  });

  // The portal emits the L1→L2 message key + its leaf index; the vote tx needs the index.
  const [deposited] = parseEventLogs({
    abi: FeeJuicePortalAbi,
    eventName: "DepositToAztecPublic",
    logs: receipt.logs,
  });
  if (!deposited) {
    throw new Error(
      "Bridge deposit did not emit a DepositToAztecPublic event.",
    );
  }
  const { key: messageKey, index: messageLeafIndex } = deposited.args;

  // 4. Wait for the message to land on L2 so the claim is consumable in the vote tx.
  const messageHash = Fr.fromHexString(messageKey);
  const startedAt = Date.now();
  while (Date.now() - startedAt < MESSAGE_TIMEOUT_MS) {
    if (await isL1ToL2MessageReady(node, messageHash)) {
      onStatus?.({ phase: "ready" });
      return { claimAmount: amount, claimSecret, messageLeafIndex };
    }
    onStatus?.({
      phase: "waiting-message",
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
    await new Promise((r) => setTimeout(r, MESSAGE_POLL_INTERVAL_MS));
  }
  throw new Error(
    "Timed out waiting for the bridged Fee Juice to arrive on L2.",
  );
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
