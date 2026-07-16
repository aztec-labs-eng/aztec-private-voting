/**
 * Integration test for the `PrivateFeeJuice` FPC against an in-process Aztec network.
 *
 * TXE unit tests don't model FPCs / fee payment well, so this is where we prove the
 * contract end-to-end. It exercises both entrypoints exactly as the app + deploy script
 * will use them:
 *
 *   - `fee_entrypoint_with_topup` — an unfunded voter bridges Fee Juice to the FPC and
 *     pays for their first vote in one tx (the FPC is the fee payer).
 *   - `fee_entrypoint`            — a second vote spends the leftover balance the topup
 *     left in the voter's private ledger note, no bridge needed.
 *
 * The FPC is **fully private**, so it is never deployed on-chain — we just derive its
 * deterministic address and register the instance in the wallet's PXE, mirroring how
 * the SponsoredFPC is handled in the frontend. That an unfunded voter can vote at all is
 * itself proof the FPC paid; `get_balance` confirms the ledger accounting.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { createFundedInitializerlessAccounts } from "@aztec/wallets/testing";
import { deriveMasterMessageSigningSecretKey } from "@aztec/stdlib/keys";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import type { AztecAddress } from "@aztec/aztec.js/addresses";
import { L1FeeJuicePortalManager } from "@aztec/aztec.js/ethereum";
import { isL1ToL2MessageReady } from "@aztec/aztec.js/messaging";
import { createExtendedL1Client } from "@aztec/ethereum/client";
import { createEthereumChain } from "@aztec/ethereum/chain";
import { createLogger } from "@aztec/foundation/log";

import { setupLocalNetwork, type LocalNetwork } from "@aztec/aztec/testing";
import { LOCAL_L1_FUNDER_KEY } from "../../lib/aztec-kit/deploy/network-config.ts";
import {
  PrivateVotingContract,
  PrivateVotingContractArtifact,
} from "../../packages/contracts/artifacts/PrivateVoting.ts";
import {
  PrivateFeeJuiceContract,
  PrivateFeeJuiceContractArtifact,
} from "../../packages/contracts/artifacts/PrivateFeeJuice.ts";
import {
  PrivateFeeJuicePaymentMethod,
  PrivateFeeJuiceTopupPaymentMethod,
} from "../../packages/app/src/aztec/private_fee_juice_payment.ts";

const ELECTION_1 = { id: new Fr(1n) };
const ELECTION_2 = { id: new Fr(2n) };
const PICK = new Fr(7n);
// Bridge a generous amount so it comfortably covers the max possible fee and leaves a
// balance for the second (no-topup) vote.
const BRIDGE_AMOUNT = BigInt("1000000000000000000000"); // 1000 FJ
// Shared, deterministic FPC salt (the deploy script + frontend use the same constant).
const FPC_SALT = new Fr(0x1234n);

let network: LocalNetwork;
let wallet: EmbeddedWallet;
let admin: AztecAddress;
let voter: AztecAddress;
let voting: PrivateVotingContract;
let fpc: PrivateFeeJuiceContract;

/** Mints + bridges Fee Juice to `recipient` on L1, then mines L2 blocks until the L1→L2
 *  message is consumable. Returns the claim `fee_entrypoint_with_topup` needs. */
async function bridgeToFpc(recipient: AztecAddress) {
  const chain = createEthereumChain([network.l1RpcUrl], network.l1ChainId);
  const l1Client = createExtendedL1Client(
    chain.rpcUrls,
    LOCAL_L1_FUNDER_KEY,
    chain.chainInfo,
  );
  const portal = await L1FeeJuicePortalManager.new(
    network.node,
    l1Client,
    createLogger("test:bridge"),
  );
  // mint=true: the in-process network has no faucet handler, so mint the L1 Fee Juice
  // first (test-only) and bridge it in one call.
  const claim = await portal.bridgeTokensPublic(recipient, BRIDGE_AMOUNT, true);

  // Force L2 blocks until the message is available (the automine sequencer only builds
  // blocks for txs, so nudge it manually).
  const messageHash = Fr.fromHexString(claim.messageHash);
  const node = network.node as typeof network.node & { mineBlock: () => Promise<unknown> };
  for (let i = 0; i < 120; i++) {
    if (await isL1ToL2MessageReady(network.node, messageHash)) break;
    await node.mineBlock();
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!(await isL1ToL2MessageReady(network.node, messageHash))) {
    throw new Error("L1→L2 fee-juice message did not become available in time");
  }
  return {
    claimAmount: BigInt(claim.claimAmount),
    claimSecret: claim.claimSecret,
    messageLeafIndex: BigInt(claim.messageLeafIndex),
  };
}

beforeAll(async () => {
  const [testAccount] = await getInitialTestAccountsData();
  admin = testAccount.address;
  network = await setupLocalNetwork({ fundedAddresses: [admin] });
  wallet = await EmbeddedWallet.create(network.node, { ephemeral: true });
  await createFundedInitializerlessAccounts(wallet, [testAccount]);

  // Deploy PrivateVoting and open two elections (so one voter can cast two distinct votes
  // without tripping the per-election nullifier).
  const deployMethod = PrivateVotingContract.deploy(wallet, admin, {
    deployer: admin,
    salt: new Fr(0),
  });
  await wallet.registerContract(
    await deployMethod.getInstance(),
    PrivateVotingContractArtifact,
  );
  const { contract } = await deployMethod.send({ from: admin });
  voting = contract;
  await voting.methods.start_vote(ELECTION_1).send({ from: admin });
  await voting.methods.start_vote(ELECTION_2).send({ from: admin });

  // Register the fully-private FPC by deterministic address — no on-chain deploy.
  const fpcInstance = await getContractInstanceFromInstantiationParams(
    PrivateFeeJuiceContractArtifact,
    { salt: FPC_SALT },
  );
  await wallet.registerContract(fpcInstance, PrivateFeeJuiceContractArtifact);
  fpc = PrivateFeeJuiceContract.at(fpcInstance.address, wallet);

  // A fresh, UNFUNDED voter — the FPC, not the voter, pays the fees.
  const voterSecret = Fr.random();
  const voterAccount = await wallet.createSchnorrInitializerlessAccount(
    voterSecret,
    Fr.random(),
    deriveMasterMessageSigningSecretKey(voterSecret),
  );
  voter = voterAccount.address;
}, 300_000);

afterAll(async () => {
  await network?.stop();
});

describe("PrivateFeeJuice FPC (in-process network)", () => {
  it("starts every voter with a zero balance", async () => {
    const { result } = await fpc.methods.get_balance(voter).simulate({ from: voter });
    expect(BigInt(result.toString())).toBe(0n);
  });

  it("topup entrypoint: an unfunded voter bridges + votes in one tx, FPC pays", async () => {
    const claim = await bridgeToFpc(fpc.address);

    await voting.methods.cast_vote(ELECTION_1, PICK).send({
      from: voter,
      fee: { paymentMethod: new PrivateFeeJuiceTopupPaymentMethod(fpc.address, claim) },
    });

    // The vote landed (only possible if the FPC paid — the voter holds no Fee Juice).
    const { result: tally } = await voting.methods
      .get_tally(ELECTION_1, PICK)
      .simulate({ from: voter });
    expect(BigInt(tally.toString())).toBe(1n);

    // The ledger now holds the deposit minus the fee that was just spent.
    const { result: balance } = await fpc.methods
      .get_balance(voter)
      .simulate({ from: voter });
    const after = BigInt(balance.toString());
    expect(after).toBeGreaterThan(0n);
    expect(after).toBeLessThan(claim.claimAmount);
  });

  it("plain entrypoint: a second vote spends the leftover balance, no bridge", async () => {
    const { result: before } = await fpc.methods
      .get_balance(voter)
      .simulate({ from: voter });
    const balanceBefore = BigInt(before.toString());

    await voting.methods.cast_vote(ELECTION_2, PICK).send({
      from: voter,
      fee: { paymentMethod: new PrivateFeeJuicePaymentMethod(fpc.address) },
    });

    const { result: tally } = await voting.methods
      .get_tally(ELECTION_2, PICK)
      .simulate({ from: voter });
    expect(BigInt(tally.toString())).toBe(1n);

    // The fee for this vote came out of the existing ledger balance.
    const { result: after } = await fpc.methods
      .get_balance(voter)
      .simulate({ from: voter });
    expect(BigInt(after.toString())).toBeLessThan(balanceBefore);
  });
});
