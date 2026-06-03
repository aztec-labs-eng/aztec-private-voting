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

// docs:start:simulate_vote
/**
 * SIMULATE: run the private function locally to preview the result and surface
 * errors (like trying to vote twice) before paying for anything.
 */
export async function simulateVote(
  voting: PrivateVotingContract,
  session: Session,
  deployment: Deployment,
  candidate: bigint,
): Promise<void> {
  await voting.methods
    .cast_vote(election(deployment), new Fr(candidate))
    .simulate({ from: session.address });
}
// docs:end:simulate_vote

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
      wait: { waitForStatus: TxStatus.PROPOSED, timeout: 120 },
    });
}
// docs:end:send_vote

/** Read the public tally for a candidate. */
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
