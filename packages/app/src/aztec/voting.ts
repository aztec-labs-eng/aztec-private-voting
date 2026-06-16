/**
 * The interaction the quickstart drills: REGISTER -> SIMULATE -> SEND.
 *
 * Each step is its own labelled region so the tutorial can show them one at a
 * time. The vote runs in private; only the public tally ever changes.
 */
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { TxStatus } from "@aztec/stdlib/tx";
import { getPublicEvents } from "@aztec/aztec.js/events";

import {
  PrivateVotingContract,
  PrivateVotingContractArtifact,
} from "@app/contracts/PrivateVoting";
import type { Session } from "./wallet.ts";
import type { Deployment } from "./deployment.ts";

function election(deployment: Deployment) {
  return { id: new Fr(BigInt(deployment.electionId)) };
}

// docs:start:register_contract
/**
 * REGISTER: teach our PXE about the deployed contract. We rebuild the instance
 * deterministically from (artifact, deployer, salt, constructor args) and hand
 * it to the wallet — no on-chain call, just local registration.
 */
export async function registerVoting(
  session: Session,
  deployment: Deployment,
): Promise<PrivateVotingContract> {
  const deployer = AztecAddress.fromString(deployment.deployer);
  const instance = await getContractInstanceFromInstantiationParams(PrivateVotingContractArtifact, {
    constructorArgs: [deployer],
    salt: Fr.fromString(deployment.salt),
    deployer,
  });
  await session.wallet.registerContract(instance, PrivateVotingContractArtifact);
  return PrivateVotingContract.at(instance.address, session.wallet);
}
// docs:end:register_contract

/**
 * Confirm the voting contract is actually published on chain. Its constructor is a
 * public `#[initializer]`, so the contract must have been deployed (via
 * `npm run deploy`) before anyone can vote — registering it only teaches our local
 * PXE about it, it doesn't put it on chain. `node.getContract` returns `undefined`
 * when the node has never seen the address; we fail loudly here rather than let the
 * first vote blow up deep inside proving with an opaque "unknown nullifier" error.
 */
export async function assertVotingPublished(
  session: Session,
  deployment: Deployment,
): Promise<void> {
  const address = AztecAddress.fromString(deployment.contractAddress);
  const published = await session.node.getContract(address);
  if (!published) {
    throw new Error(
      `The voting contract at ${deployment.contractAddress} is not published on "${deployment.network}". ` +
        `Deploy it first with \`npm run deploy\`${
          deployment.network === "testnet" ? " (or `npm run deploy:testnet`)" : ""
        }, then reload.`,
    );
  }
}


// docs:start:send_vote
/**
 * SEND: submit the real transaction. The vote stays private; the network only
 * sees a nullifier (so you can't vote twice) and the public tally going up by 1.
 */
export async function sendVote(
  voting: PrivateVotingContract,
  session: Session,
  deployment: Deployment,
  candidate: bigint,
): Promise<void> {
  await voting.methods
    .cast_vote(election(deployment), new Fr(candidate))
    .send({
      from: session.address,
      fee: { paymentMethod: session.paymentMethod },
    });
}
// docs:end:send_vote

// docs:start:simulate_query
/**
 * SIMULATE: most of what an app does is *read* state to populate the UI. A
 * simulate runs the function locally against the latest state and returns the
 * value without sending a transaction or paying a fee. Here we read the public
 * tally for a candidate; the app calls this for every candidate to draw the chart.
 */
export async function getTally(
  voting: PrivateVotingContract,
  session: Session,
  deployment: Deployment,
  candidate: bigint,
): Promise<number> {
  const { result } = await voting.methods
    .get_tally(election(deployment), new Fr(candidate))
    .simulate({ from: session.address });
  return Number(result);
}
// docs:end:simulate_query

export interface VoteEvent {
  candidate: bigint;
  tally: bigint;
  blockNumber: number;
  txHash: string;
}

// docs:start:query_events
/**
 * QUERY PUBLIC EVENTS: read the public `TallyUpdated` events the contract emits.
 * These are public logs anyone can fetch from the node and decode with the
 * event's ABI; they reveal the candidate and running tally, never the voter. We
 * use them to build a live feed of votes as they land.
 */
export async function getVoteFeed(
  session: Session,
  deployment: Deployment,
): Promise<VoteEvent[]> {
  // Field values decode to bigint at runtime, so we type the event accordingly.
  const { events } = await getPublicEvents<{ candidate: bigint; tally: bigint }>(
    session.node,
    PrivateVotingContract.events.TallyUpdated,
    { contractAddress: AztecAddress.fromString(deployment.contractAddress) },
  );
  return events
    .map((e) => ({
      candidate: BigInt(e.event.candidate),
      tally: BigInt(e.event.tally),
      blockNumber: e.metadata.l2BlockNumber,
      txHash: e.metadata.txHash.toString(),
    }))
    .sort((a, b) => b.blockNumber - a.blockNumber); // newest first
}
// docs:end:query_events

// docs:start:query_private_events
/**
 * QUERY PRIVATE EVENTS: read the private `Vote` events the contract delivered to
 * *us* when we cast a vote. Unlike the public `TallyUpdated` feed, each `Vote` is
 * encrypted to the voter and only retrievable by the account it was delivered to:
 * `wallet.getPrivateEvents` returns just the ones in our scope. We use it to
 * remind the user which candidate they picked — something no one else can see.
 *
 * Returns the candidate this account voted for in the deployment's election, or
 * `null` if they haven't voted yet (a nullifier means at most one vote per
 * election, so there is never more than one).
 */
export async function getMyVote(
  session: Session,
  deployment: Deployment,
): Promise<bigint | null> {
  const events = await session.wallet.getPrivateEvents<{
    election_id: bigint;
    candidate: bigint;
    voter: AztecAddress;
  }>(PrivateVotingContract.events.Vote, {
    contractAddress: AztecAddress.fromString(deployment.contractAddress),
    scopes: [session.address],
  });
  const mine = events.find(
    (e) => BigInt(e.event.election_id) === BigInt(deployment.electionId),
  );
  return mine ? BigInt(mine.event.candidate) : null;
}
// docs:end:query_private_events
