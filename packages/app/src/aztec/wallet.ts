/**
 * Browser wallet setup.
 *
 * Connects to the Aztec node, spins up an in-browser `EmbeddedWallet`, and gives
 * it an account whose secret + salt are persisted in localStorage. On reload we
 * reconstruct the same account and skip the on-chain deploy if it already exists,
 * so a visitor keeps one identity — and therefore one vote per election (the
 * nullifier enforces the rest; reloading does not buy you another vote). Fees are
 * paid by the SponsoredFPC, so the visitor needs no fee juice.
 */
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { NO_FROM } from "@aztec/aztec.js/account";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { ContractInitializationStatus } from "@aztec/aztec.js/wallet";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { TxStatus } from "@aztec/stdlib/tx";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import type { AztecAddress } from "@aztec/aztec.js/addresses";

// Persisted account identity (secret + salt). The PXE itself stays ephemeral;
// this is just enough to rebuild the same account across reloads.
const ACCOUNT_KEY = "private-voting:account";

function loadStoredAccount(): { secret: Fr; salt: Fr } | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const { secret, salt } = JSON.parse(raw) as { secret: string; salt: string };
    return { secret: Fr.fromString(secret), salt: Fr.fromString(salt) };
  } catch {
    return null;
  }
}

function storeAccount(secret: Fr, salt: Fr): void {
  try {
    localStorage.setItem(
      ACCOUNT_KEY,
      JSON.stringify({ secret: secret.toString(), salt: salt.toString() }),
    );
  } catch {
    /* storage unavailable (private mode, etc.) — fall back to a session-only account */
  }
}

export interface Session {
  wallet: EmbeddedWallet;
  /** The node client, used for read-only queries like public event lookups. */
  node: AztecNode;
  address: AztecAddress;
  /** Pass to `.send({ fee: { paymentMethod } })` so the FPC sponsors the gas. */
  paymentMethod: SponsoredFeePaymentMethod;
}

/** Phases the setup modal narrates as they happen. */
export type ConnectPhase = "connect" | "account";

export async function connect(
  nodeUrl: string,
  onPhase?: (phase: ConnectPhase) => void,
): Promise<Session> {
  // 1. Connect to the node and spin up an in-browser wallet (its own PXE).
  onPhase?.("connect");
  const node = createAztecNodeClient(nodeUrl);
  const wallet = await EmbeddedWallet.create(node, { ephemeral: true, pxe: { proverEnabled: !nodeUrl.includes("localhost")} });

  // Register the canonical SponsoredFPC and use it to pay fees on local.
  const sponsoredFPC = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(SPONSORED_FPC_SALT) },
  );
  await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  // 2. Reconstruct the saved account (or mint a new one) and register it.
  onPhase?.("account");
  const saved = loadStoredAccount();
  const secret = saved?.secret ?? Fr.random();
  const salt = saved?.salt ?? Fr.random();
  const account = await wallet.createSchnorrAccount(secret, salt, deriveSigningKey(secret));
  storeAccount(secret, salt);

  // Deploy it only if it isn't already on-chain — return visits skip this entirely.
  const { initializationStatus } = await wallet.getContractMetadata(account.address);
  if (initializationStatus !== ContractInitializationStatus.INITIALIZED) {
    const deployMethod = await account.getDeployMethod();
    await deployMethod.send({
      from: NO_FROM,
      fee: { paymentMethod },
      skipClassPublication: true,
      skipInstancePublication: true,
      wait: { waitForStatus: TxStatus.PROPOSED, timeout: 120 },
    });
  }

  return { wallet, node, address: account.address, paymentMethod };
}
