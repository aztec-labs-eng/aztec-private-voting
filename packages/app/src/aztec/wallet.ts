/**
 * Browser wallet setup.
 *
 * Connects to the Aztec node, spins up an in-browser `EmbeddedWallet`, and gives
 * it a fresh ephemeral account. Fees are paid by the local network's SponsoredFPC, so
 * the visitor doesn't need any fee juice. A fresh account per session means each
 * visitor gets exactly one vote per election (the nullifier enforces the rest).
 */
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { NO_FROM } from "@aztec/aztec.js/account";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { TxStatus } from "@aztec/stdlib/tx";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";
import type { AztecAddress } from "@aztec/aztec.js/addresses";

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
  const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

  // Register the canonical SponsoredFPC and use it to pay fees on local.
  const sponsoredFPC = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(SPONSORED_FPC_SALT) },
  );
  await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  // 2. Create a fresh schnorr account and deploy it, fees sponsored by the FPC.
  onPhase?.("account");
  const secret = Fr.random();
  const account = await wallet.createSchnorrAccount(secret, new Fr(0), deriveSigningKey(secret));
  const deployMethod = await account.getDeployMethod();
  await deployMethod.send({
    from: NO_FROM,
    fee: { paymentMethod },
    skipClassPublication: true,
    skipInstancePublication: true,
    wait: { waitForStatus: TxStatus.PROPOSED, timeout: 120 },
  });

  return { wallet, node, address: account.address, paymentMethod };
}
