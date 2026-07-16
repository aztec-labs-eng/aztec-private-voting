/**
 * Integration test: drives the *real* contract through a local Aztec network
 * the suite spins up itself — the node runs inline in this process, backed by
 * a throwaway anvil spawned per suite — exactly like the frontend would, but
 * headless and fast.
 *
 * The network comes from `setupLocalNetwork` (`@aztec/aztec/testing`), the
 * same codepath as `aztec start --local-network`. Prefunded test accounts pay
 * the fees, so there is no bridging on the local path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { createFundedInitializerlessAccounts } from "@aztec/wallets/testing";
import { getPublicEvents } from "@aztec/aztec.js/events";
import type { AztecAddress } from "@aztec/aztec.js/addresses";

import { setupLocalNetwork, type LocalNetwork } from "@aztec/aztec/testing";
import {
  PrivateVotingContract,
  PrivateVotingContractArtifact,
} from "../../packages/contracts/artifacts/PrivateVoting.ts";

const ELECTION = { id: new Fr(1n) };
const ALICE_PICK = new Fr(7n);

let network: LocalNetwork;
let wallet: EmbeddedWallet;
let admin: AztecAddress;
let voting: PrivateVotingContract;

// docs:start:integration_setup
beforeAll(async () => {
  // Prefund the first test account at genesis; as an initializerless account it
  // needs no deploy tx — creating it registers the instance and it's usable.
  const [testAccount] = await getInitialTestAccountsData();
  admin = testAccount.address;
  network = await setupLocalNetwork({ fundedAddresses: [admin] });
  wallet = await EmbeddedWallet.create(network.node, { ephemeral: true });
  await createFundedInitializerlessAccounts(wallet, [testAccount]);

  // Deploy PrivateVoting (registers class + instance + runs constructor) and
  // open the election. `deploy` also registers the instance with our PXE.
  const deployMethod = PrivateVotingContract.deploy(wallet, admin, {
    deployer: admin,
    salt: new Fr(0),
  });
  await wallet.registerContract(await deployMethod.getInstance(), PrivateVotingContractArtifact);
  const { contract } = await deployMethod.send({ from: admin });
  voting = contract;
  await voting.methods.start_vote(ELECTION).send({ from: admin });
}, 300_000);

afterAll(async () => {
  await network?.stop();
});
// docs:end:integration_setup

describe("PrivateVoting (in-process network)", () => {
  // docs:start:integration_vote
  it("counts a private vote in the public tally", async () => {
    // SIMULATE then SEND — the same flow the frontend runs.
    await voting.methods.cast_vote(ELECTION, ALICE_PICK).simulate({ from: admin });
    await voting.methods.cast_vote(ELECTION, ALICE_PICK).send({ from: admin });

    const { result } = await voting.methods.get_tally(ELECTION, ALICE_PICK).simulate({ from: admin });
    expect(BigInt(result.toString())).toBe(1n);
  });
  // docs:end:integration_vote

  it("emits a public TallyUpdated event for the live feed", async () => {
    const { events } = await getPublicEvents<{ candidate: bigint; tally: bigint }>(
      network.node,
      PrivateVotingContract.events.TallyUpdated,
      { contractAddress: voting.address },
    );
    expect(events.length).toBe(1);
    expect(BigInt(events[0].event.candidate)).toBe(ALICE_PICK.toBigInt());
    expect(BigInt(events[0].event.tally)).toBe(1n);
  });

  it("delivers a private Vote event only the voter can read", async () => {
    // The contract emits `Vote` privately and delivers it on-chain to msg_sender,
    // so our wallet can decrypt it for our own account but no one else can.
    const events = await wallet.getPrivateEvents<{
      election_id: bigint;
      candidate: bigint;
      voter: AztecAddress;
    }>(PrivateVotingContract.events.Vote, {
      contractAddress: voting.address,
      scopes: [admin],
    });
    expect(events.length).toBe(1);
    expect(BigInt(events[0].event.election_id)).toBe(ELECTION.id.toBigInt());
    expect(BigInt(events[0].event.candidate)).toBe(ALICE_PICK.toBigInt());
    expect(events[0].event.voter.toString()).toBe(admin.toString());
  });

  it("rejects a second vote from the same account (duplicate nullifier)", async () => {
    await expect(
      voting.methods.cast_vote(ELECTION, ALICE_PICK).send({ from: admin }),
    ).rejects.toThrow();

    // Tally is unchanged: still the single vote from the first test.
    const { result } = await voting.methods.get_tally(ELECTION, ALICE_PICK).simulate({ from: admin });
    expect(BigInt(result.toString())).toBe(1n);
  });
});
