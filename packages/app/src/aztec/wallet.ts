/**
 * Browser wallet setup.
 *
 * Connects to the node, spins up an in-browser `EmbeddedWallet`, and gives it a
 * Schnorr *initializerless* account: it needs **no on-chain deployment** (the
 * account contract has no initializer), so it can send transactions straight away
 * with fees sponsored by the SponsoredFPC — the visitor needs no fee juice and
 * there's no account-deploy step. The account's secret + salt are persisted in
 * localStorage and reconstructed on reload, so a visitor keeps one identity (and
 * therefore one vote per election; the nullifier enforces the rest).
 */
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
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

  // 2. Reconstruct (or mint) the saved account. Initializerless = no deploy tx:
  //    creating it registers it in our PXE and it's immediately usable.
  onPhase?.("account");
  const saved = loadStoredAccount();
  const secret = saved?.secret ?? Fr.random();
  const salt = saved?.salt ?? Fr.random();
  const account = await wallet.createSchnorrInitializerlessAccount(
    secret,
    salt,
    deriveSigningKey(secret),
  );
  storeAccount(secret, salt);

  return { wallet, node, address: account.address, paymentMethod };
}
