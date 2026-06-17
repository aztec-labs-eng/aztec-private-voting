/**
 * `VotingClient` — everything a connected voter can do, bound to one network.
 *
 * Selecting a network builds one of these via `VotingClient.connect()`: it
 * instantiates the in-browser wallet + account + fee payment method and binds the
 * deployed contract. After that the UI holds only the client and calls
 *
 *   vote() · readTallies() · getFeed() · getMyVote()
 *
 * — the wallet, contract, account and payment method stay private to the client,
 * so the UI never threads service state back through the SDK. The flow inside
 * `connect` is the quickstart's CONNECT -> REGISTER; the methods below are
 * SIMULATE (read) -> SEND (vote) -> QUERY EVENTS.
 */
import { createAztecNodeClient, type AztecNode } from "@aztec/aztec.js/node";
import { EmbeddedWallet } from "@aztec/wallets/embedded";
import { Fr } from "@aztec/aztec.js/fields";
import { AztecAddress } from "@aztec/aztec.js/addresses";
import { SponsoredFeePaymentMethod } from "@aztec/aztec.js/fee";
import { getPublicEvents } from "@aztec/aztec.js/events";
import { BatchCall } from "@aztec/aztec.js/contracts";
import { deriveSigningKey } from "@aztec/stdlib/keys";
import { getContractInstanceFromInstantiationParams } from "@aztec/stdlib/contract";
import { SPONSORED_FPC_SALT } from "@aztec/constants";
import { SponsoredFPCContractArtifact } from "@aztec/noir-contracts.js/SponsoredFPC";

import {
  PrivateVotingContract,
  PrivateVotingContractArtifact,
} from "@app/contracts/PrivateVoting";
import { election, type Deployment } from "./deployment.ts";

/** The steps `connect` narrates as they happen, for the setup modal. */
export type SetupPhase = "connect" | "account" | "register" | "done" | "error";

export interface VoteEvent {
  candidate: bigint;
  tally: bigint;
  blockNumber: number;
  txHash: string;
}

// ── Account persistence ──────────────────────────────────────────────────────
// The PXE stays ephemeral; we persist just the account's secret + salt so a
// visitor keeps one identity across reloads (and therefore one vote per election;
// the nullifier enforces the rest).
const ACCOUNT_KEY = "private-voting:account";

function loadStoredAccount(): { secret: Fr; salt: Fr } | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const { secret, salt } = JSON.parse(raw) as {
      secret: string;
      salt: string;
    };
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

export class VotingClient {
  private constructor(
    private readonly wallet: EmbeddedWallet,
    private readonly voting: PrivateVotingContract,
    private readonly account: AztecAddress,
    private readonly paymentMethod: SponsoredFeePaymentMethod,
    private readonly deployment: Deployment,
    private readonly node: AztecNode,
  ) {}

  /** The address we vote as (for display). */
  get address(): AztecAddress {
    return this.account;
  }

  /**
   * CONNECT: open an in-browser wallet (its own PXE) against the network's node,
   * give it a Schnorr *initializerless* account — no on-chain deploy, so it can
   * transact straight away with fees sponsored by the SponsoredFPC — then bind the
   * deployed voting contract. Everything the network choice dictates (contract,
   * account, payment method) is captured here and kept private to the client.
   */
  static async connect(
    deployment: Deployment,
    onPhase?: (phase: SetupPhase) => void,
  ): Promise<VotingClient> {
    // 1. Connect to the node and spin up the wallet.
    onPhase?.("connect");
    const node = createAztecNodeClient(deployment.nodeUrl);
    const wallet = await EmbeddedWallet.create(node, {
      ephemeral: true,
      pxe: { proverEnabled: !deployment.nodeUrl.includes("localhost") },
    });

    // Register the canonical SponsoredFPC and use it to pay fees.
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

    // 3. Bind the deployed contract.
    onPhase?.("register");
    const voting = await VotingClient.register(wallet, node, deployment);

    onPhase?.("done");
    return new VotingClient(
      wallet,
      voting,
      account.address,
      paymentMethod,
      deployment,
      node,
    );
  }

  // docs:start:register_contract
  /**
   * REGISTER: teach our PXE about the deployed contract. The voting contract is
   * published on chain (its constructor is a public `#[initializer]`), so instead of
   * rebuilding the instance from deploy params we just ask the node for it with
   * `getContract(address)` and hand that to the wallet — no local guesswork, and the
   * deployment JSON only needs the address.
   *
   * This doubles as cheap protection against a missing deployment: `getContract`
   * returns `undefined` when the node has never seen the address, so we fail loudly
   * here rather than let the first vote blow up deep inside proving with an opaque
   * "unknown nullifier" error.
   */
  private static async register(
    wallet: EmbeddedWallet,
    node: AztecNode,
    deployment: Deployment,
  ): Promise<PrivateVotingContract> {
    const address = AztecAddress.fromString(deployment.contractAddress);
    const instance = await node.getContract(address);
    if (!instance) {
      throw new Error(
        `The voting contract at ${deployment.contractAddress} is not published on "${deployment.network}". ` +
          `Deploy it first with \`npm run deploy\`${
            deployment.network === "testnet"
              ? " (or `npm run deploy:testnet`)"
              : ""
          }, then reload.`,
      );
    }
    await wallet.registerContract(instance, PrivateVotingContractArtifact);
    return PrivateVotingContract.at(instance.address, wallet);
  }
  // docs:end:register_contract

  // docs:start:send_vote
  /**
   * SEND: submit the real transaction. The vote stays private; the network only
   * sees a nullifier (so you can't vote twice) and the public tally going up by 1.
   */
  async vote(candidate: bigint): Promise<void> {
    await this.voting.methods
      .cast_vote(election(this.deployment), new Fr(candidate))
      .send({ from: this.account, fee: { paymentMethod: this.paymentMethod } });
  }
  // docs:end:send_vote

  // docs:start:simulate_query
  /**
   * SIMULATE: most of what an app does is *read* state to populate the UI. A
   * simulate runs the function locally against the latest state and returns the
   * value without sending a transaction or paying a fee. The chart needs every
   * candidate's tally, so we batch all the `get_tally` reads into a single
   * simulation with `BatchCall` instead of one round-trip per candidate.
   */
  async readTallies(): Promise<Record<string, number>> {
    const { candidates } = this.deployment;
    const batch = new BatchCall(
      this.wallet,
      candidates.map((c) =>
        this.voting.methods.get_tally(
          election(this.deployment),
          new Fr(BigInt(c.id)),
        ),
      ),
    );
    const { result } = await batch.simulate({ from: this.account });
    return Object.fromEntries(
      candidates.map((c, i) => [c.id, Number(result[i].result)]),
    );
  }
  // docs:end:simulate_query

  // docs:start:query_events
  /**
   * QUERY PUBLIC EVENTS: read the public `TallyUpdated` events the contract emits.
   * These are public logs anyone can fetch from the node and decode with the
   * event's ABI; they reveal the candidate and running tally, never the voter. We
   * use them to build a live feed of votes as they land.
   */
  async getFeed(): Promise<VoteEvent[]> {
    // Field values decode to bigint at runtime, so we type the event accordingly.
    const { events } = await getPublicEvents<{
      candidate: bigint;
      tally: bigint;
    }>(this.node, PrivateVotingContract.events.TallyUpdated, {
      contractAddress: AztecAddress.fromString(this.deployment.contractAddress),
    });
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
  async getMyVote(): Promise<bigint | null> {
    const events = await this.wallet.getPrivateEvents<{
      election_id: bigint;
      candidate: bigint;
      voter: AztecAddress;
    }>(PrivateVotingContract.events.Vote, {
      contractAddress: AztecAddress.fromString(this.deployment.contractAddress),
      scopes: [this.account],
    });
    const mine = events.find(
      (e) => BigInt(e.event.election_id) === BigInt(this.deployment.electionId),
    );
    return mine ? BigInt(mine.event.candidate) : null;
  }
  // docs:end:query_private_events
}
