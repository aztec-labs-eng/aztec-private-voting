/**
 * Browser wallet setup.
 *
 * Connects to the Aztec node, spins up an in-browser `EmbeddedWallet`, and gives
 * it a fresh ephemeral account. Fees are paid by the sandbox's SponsoredFPC, so
 * the visitor doesn't need any fee juice. A fresh account per session means each
 * visitor gets exactly one vote per election (the nullifier enforces the rest).
 */
import { createAztecNodeClient } from "@aztec/aztec.js/node";
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
  address: AztecAddress;
  /** Pass to `.send({ fee: { paymentMethod } })` so the FPC sponsors the gas. */
  paymentMethod: SponsoredFeePaymentMethod;
}

export async function connect(nodeUrl: string): Promise<Session> {
  const node = createAztecNodeClient(nodeUrl);
  const wallet = await EmbeddedWallet.create(node, { ephemeral: true });

  // Register the canonical SponsoredFPC and use it to pay fees on local.
  const sponsoredFPC = await getContractInstanceFromInstantiationParams(
    SponsoredFPCContractArtifact,
    { salt: new Fr(SPONSORED_FPC_SALT) },
  );
  await wallet.registerContract(sponsoredFPC, SponsoredFPCContractArtifact);
  const paymentMethod = new SponsoredFeePaymentMethod(sponsoredFPC.address);

  // Fresh schnorr account, deployed with fees sponsored by the FPC.
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

  return { wallet, address: account.address, paymentMethod };
}
