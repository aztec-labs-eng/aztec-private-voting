/**
 * Integration test: drives the *real* contract through an in-process Aztec
 * network (anvil + L1 contracts + an AztecNode, all in this process), exactly
 * like the frontend would, but headless and fast.
 *
 * The in-process network helper is borrowed from aztec-kit (see lib/aztec-kit).
 * Prefunded test accounts (anvil/forge-familiar) pay the fees, so there is no
 * bridging on the local path.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { getInitialTestAccountsData } from "@aztec/accounts/testing";
import { createFundedInitializerlessAccounts } from "@aztec/wallets/testing";
import { getPublicEvents } from "@aztec/aztec.js/events";
import type { AztecAddress } from "@aztec/aztec.js/addresses";

import { setupLocalNetwork, type LocalNetwork } from "../../lib/aztec-kit/testing/index.ts";
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

describe("PrivateVoting (in-process network)", () => {
  it("counts a private vote in the public tally", async () => {
    // SIMULATE then SEND — the same flow the frontend runs.
    await voting.methods.cast_vote(ELECTION, ALICE_PICK).simulate({ from: admin });
    await voting.methods.cast_vote(ELECTION, ALICE_PICK).send({ from: admin });

    const { result } = await voting.methods.get_tally(ELECTION, ALICE_PICK).simulate({ from: admin });
    expect(BigInt(result.toString())).toBe(1n);
  });

  it("emits a public VoteCast event for the live feed", async () => {
    const { events } = await getPublicEvents<{ candidate: bigint; tally: bigint }>(
      network.node,
      PrivateVotingContract.events.VoteCast,
      { contractAddress: voting.address },
    );
    expect(events.length).toBe(1);
    expect(BigInt(events[0].event.candidate)).toBe(ALICE_PICK.toBigInt());
    expect(BigInt(events[0].event.tally)).toBe(1n);
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
