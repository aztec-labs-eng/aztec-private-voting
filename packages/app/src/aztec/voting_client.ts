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
import {
  SponsoredFeePaymentMethod,
  type FeePaymentMethod,
} from "@aztec/aztec.js/fee";
import { getPublicEvents } from "@aztec/aztec.js/events";
import { BatchCall } from "@aztec/aztec.js/contracts";
import { deriveMasterMessageSigningSecretKey } from "@aztec/stdlib/keys";
import {
  getContractInstanceFromInstantiationParams,
  type ContractInstanceWithAddress,
} from "@aztec/stdlib/contract";
import { SPONSORED_FPC_SALT } from "@aztec/constants";

import type { PrivateVotingContract } from "@app/contracts/PrivateVoting";
import type { PrivateFeeJuiceContract } from "@app/contracts/PrivateFeeJuice";
import { election, type Deployment } from "./deployment.ts";
import {
  PrivateFeeJuicePaymentMethod,
  PrivateFeeJuiceTopupPaymentMethod,
  type FeeJuiceClaim,
} from "./private_fee_juice_payment.ts";
import { bridgeFeeJuiceToFpc, type BridgeStatus } from "./bridge.ts";

const loadVotingContract = () => import("@app/contracts/PrivateVoting");
const loadPrivateFeeJuiceContract = () =>
  import("@app/contracts/PrivateFeeJuice");
const loadSponsoredFPCContract = () =>
  import("@aztec/noir-contracts.js/SponsoredFPC");

/** The steps `connect` narrates as they happen, for the setup modal. */
export type SetupPhase = "connect" | "account" | "register" | "done" | "error";

export interface VoteEvent {
  candidate: bigint;
  tally: bigint;
  blockNumber: number;
  txHash: string;
}

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

/**
 * How this network pays fees — exactly one kind, fixed at connect:
 *   - `sponsored` → the canonical SponsoredFPC (local): pays for everyone, no balance needed.
 *   - `fpc`       → the PrivateFeeJuice FPC (testnet): the voter bridges + tops up first.
 * We keep only the registered instance; the concrete `FeePaymentMethod` is built per-vote
 * in `votePaymentMethod`, since on testnet it depends on whether a top-up is pending.
 */
type FeePayment =
  | { type: "sponsored"; instance: ContractInstanceWithAddress }
  | { type: "fpc"; instance: PrivateFeeJuiceContract };

export class VotingClient {
  private constructor(
    private readonly wallet: EmbeddedWallet,
    private readonly voting: PrivateVotingContract,
    private readonly account: AztecAddress,
    private readonly feePayment: FeePayment,
    private readonly deployment: Deployment,
    private readonly node: AztecNode,
  ) {}

  /** A bridged-but-unspent top-up, set by `fund()` and consumed by the next `vote()`. */
  private pendingClaim: FeeJuiceClaim | null = null;

  /** The address we vote as (for display). */
  get address(): AztecAddress {
    return this.account;
  }

  /**
   * CONNECT: open an in-browser wallet against the network's node,
   * give it a Schnorr *initializerless* account — no on-chain deploy, so it can
   * transact straight away. Then bind the deployed voting contract.
   * Everything the network choice dictates (contract, account, payment method)
   * is captured here.
   */
  static async connect(
    deployment: Deployment,
    onPhase?: (phase: SetupPhase) => void,
  ): Promise<VotingClient> {
    // docs:start:connect
    // 1. Connect to the node and spin up the wallet. Whether the wallet generates
    //    real proofs follows the network itself: the node advertises `realProofs`
    //    (true on testnet, false on a local dev node).
    onPhase?.("connect");
    const node = createAztecNodeClient(deployment.nodeUrl);
    const { realProofs } = await node.getNodeInfo();
    const wallet = await EmbeddedWallet.create(node, {
      pxe: { proverEnabled: realProofs },
    });

    // 2. Reconstruct or create the saved account. Initializerless = no deploy tx:
    //    creating it registers it in our wallet and it's immediately usable.
    onPhase?.("account");
    const saved = loadStoredAccount();
    const secret = saved?.secret ?? Fr.random();
    const salt = saved?.salt ?? Fr.random();
    const account = await wallet.createSchnorrInitializerlessAccount(
      secret,
      salt,
      deriveMasterMessageSigningSecretKey(secret),
    );
    storeAccount(secret, salt);
    // docs:end:connect

    // 3. Register the contracts this network needs — the voting contract and the
    //    fee-paying FPC. `register` explains why each is fetched vs. reconstructed.
    onPhase?.("register");
    const { voting, feePayment } = await VotingClient.register(
      wallet,
      node,
      deployment,
    );

    onPhase?.("done");
    return new VotingClient(
      wallet,
      voting,
      account.address,
      feePayment,
      deployment,
      node,
    );
  }

  // docs:start:register_contract
  /**
   * REGISTER: teach our wallet about the contracts this app needs on this network, so
   * it can build transactions against them. There are two ways a contract becomes known
   * to the wallet, and this app needs both — that's the published-vs-fully-private split:
   *
   *   - The voting contract is PUBLISHED on chain (its constructor is a public
   *     `#[initializer]`), so its instance already lives on the network. We don't
   *     reconstruct it — we ask the node for it with `getContract(address)` and register
   *     whatever comes back.
   *
   *   - Both FPCs are FULLY PRIVATE: nothing about them is published, so there is
   *     nothing on chain to fetch. We rebuild instances deterministically from the
   *     same deploy params it was deployed with (artifact + salt) and register that.
   *     Which FPC is the network's choice — PrivateFeeJuice on testnet, SponsoredFPC
   *     locally.
   *
   * Returns the bound voting contract plus how this network pays fees (see `FeePayment`);
   * the payment method itself is built per-vote in `votePaymentMethod`.
   */
  private static async register(
    wallet: EmbeddedWallet,
    node: AztecNode,
    deployment: Deployment,
  ): Promise<{ voting: PrivateVotingContract; feePayment: FeePayment }> {
    // Published → fetch the live instance from the node.
    const { PrivateVotingContract, PrivateVotingContractArtifact } =
      await loadVotingContract();
    const votingInstance = await node.getContract(
      AztecAddress.fromStringUnsafe(deployment.contractAddress),
    );
    if (!votingInstance) {
      throw new Error(
        `The voting contract at ${deployment.contractAddress} is not published on ` +
          `"${deployment.network}". Deploy it first with \`npm run deploy\`` +
          (deployment.network === "testnet"
            ? " (or `npm run deploy:testnet`)"
            : "") +
          ", then reload.",
      );
    }
    await wallet.registerContract(
      votingInstance,
      PrivateVotingContractArtifact,
    );
    const voting = PrivateVotingContract.at(votingInstance.address, wallet);

    // Fully private → reconstruct the fee-paying FPC from its deploy params (artifact +
    // salt) and register that. `deployment.fpcSalt` present means testnet's PrivateFeeJuice
    // FPC; otherwise the canonical SponsoredFPC used locally.
    let feePayment: FeePayment;
    if (deployment.fpcAddress && deployment.fpcSalt) {
      const { PrivateFeeJuiceContract, PrivateFeeJuiceContractArtifact } =
        await loadPrivateFeeJuiceContract();
      const fpcInstance = await getContractInstanceFromInstantiationParams(
        PrivateFeeJuiceContractArtifact,
        { salt: Fr.fromString(deployment.fpcSalt) },
      );
      await wallet.registerContract(
        fpcInstance,
        PrivateFeeJuiceContractArtifact,
      );
      feePayment = {
        type: "fpc",
        instance: PrivateFeeJuiceContract.at(fpcInstance.address, wallet),
      };
    } else {
      const { SponsoredFPCContractArtifact } = await loadSponsoredFPCContract();
      const sponsoredInstance =
        await getContractInstanceFromInstantiationParams(
          SponsoredFPCContractArtifact,
          { salt: new Fr(SPONSORED_FPC_SALT) },
        );
      await wallet.registerContract(
        sponsoredInstance,
        SponsoredFPCContractArtifact,
      );
      feePayment = { type: "sponsored", instance: sponsoredInstance };
    }

    return { voting, feePayment };
  }
  // docs:end:register_contract

  /**
   * Whether the next vote needs a one-time top-up first: only on testnet, when the voter
   * has no FPC balance yet (and hasn't already bridged this session). Local always pays via
   * the SponsoredFPC, so it never funds — and the bridge modal never appears.
   */
  async needsFunding(): Promise<boolean> {
    if (this.feePayment.type !== "fpc") return false;
    if (this.pendingClaim) return false;
    const { result } = await this.feePayment.instance.methods
      .get_balance(this.account)
      .simulate({ from: this.account });
    return BigInt(result.toString()) === 0n;
  }

  /**
   * FUND: bridge Fee Juice from L1 into the FPC for this voter. This is a separate, slower
   * process from voting (it needs an L1 wallet and the L1→L2 message to land), so the UI
   * runs it as its own step; the resulting claim is spent by the next `vote()`. No-op when
   * funding isn't needed.
   */
  async fund(onStatus?: (status: BridgeStatus) => void): Promise<void> {
    if (this.feePayment.type !== "fpc" || this.pendingClaim) return;
    this.pendingClaim = await bridgeFeeJuiceToFpc({
      node: this.node,
      l1ChainId: Number(this.deployment.chainId),
      fpcAddress: this.feePayment.instance.address,
      onStatus,
    });
  }

  // docs:start:send_vote
  /**
   * SEND: submit the real transaction. The vote stays private; the network only sees a
   * nullifier (so you can't vote twice) and the public tally going up by 1. Fees are paid
   * by the SponsoredFPC (local) or the PrivateFeeJuice FPC (testnet) — spending a freshly
   * bridged top-up on the first vote (see `fund`), or the existing balance afterwards.
   */
  async vote(candidate: bigint): Promise<void> {
    await this.voting.methods
      .cast_vote(election(this.deployment), new Fr(candidate))
      .send({
        from: this.account,
        fee: { paymentMethod: this.votePaymentMethod() },
      });
  }
  // docs:end:send_vote

  /** The fee payment method for a vote: SponsoredFPC, a one-time top-up, or the balance. */
  private votePaymentMethod(): FeePaymentMethod {
    if (this.feePayment.type === "sponsored") {
      return new SponsoredFeePaymentMethod(this.feePayment.instance.address);
    }
    const fpc = this.feePayment.instance;
    if (this.pendingClaim) {
      const claim = this.pendingClaim;
      this.pendingClaim = null; // single-use
      return new PrivateFeeJuiceTopupPaymentMethod(fpc.address, claim);
    }
    return new PrivateFeeJuicePaymentMethod(fpc.address);
  }

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
    const getTallyInteractions = candidates.map((c) =>
      this.voting.methods.get_tally(
        election(this.deployment),
        new Fr(BigInt(c.id)),
      ),
    );
    const batch = new BatchCall(this.wallet, getTallyInteractions);
    const { result: batchResult } = await batch.simulate({
      from: this.account,
    });
    return Object.fromEntries(
      candidates.map((c, i) => [c.id, Number(batchResult[i].result)]),
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
    const { PrivateVotingContract } = await loadVotingContract();
    const { events } = await getPublicEvents<{
      candidate: bigint;
      tally: bigint;
    }>(this.node, PrivateVotingContract.events.TallyUpdated, {
      contractAddress: AztecAddress.fromStringUnsafe(
        this.deployment.contractAddress,
      ),
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
   * encrypted to the voter and only retrievable by the account it was delivered to.
   * We use it to remind the user which candidate they picked, which something no one
   * else can see.
   *
   * Returns the candidate this account voted for in the deployment's election, or
   * `null` if they haven't voted yet
   */
  async getMyVote(): Promise<bigint | null> {
    const { PrivateVotingContract } = await loadVotingContract();
    const events = await this.wallet.getPrivateEvents<{
      election_id: bigint;
      candidate: bigint;
      voter: AztecAddress;
    }>(PrivateVotingContract.events.Vote, {
      contractAddress: AztecAddress.fromStringUnsafe(
        this.deployment.contractAddress,
      ),
      scopes: [this.account],
    });
    const mine = events.find(
      (e) => BigInt(e.event.election_id) === BigInt(this.deployment.electionId),
    );
    return mine ? BigInt(mine.event.candidate) : null;
  }
  // docs:end:query_private_events
}
