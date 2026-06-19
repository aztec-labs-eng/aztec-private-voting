/**
 * `FeePaymentMethod`s for the `PrivateFeeJuice` FPC.
 *
 * The FPC is a private fee-payment contract: each account keeps a private balance
 * note tracking how much Fee Juice it has deposited into the FPC's shared public
 * pool, and the FPC pays the sequencer out of that pool while debiting the caller's
 * note. There are two entrypoints, so there are two payment methods:
 *
 *   - `PrivateFeeJuicePaymentMethod`      → `fee_entrypoint()`            (spend an
 *                                            existing balance, no args)
 *   - `PrivateFeeJuiceTopupPaymentMethod` → `fee_entrypoint_with_topup(…)` (claim a
 *                                            bridged deposit, then spend)
 *
 * No stock aztec.js payment method matches these, so we implement the
 * `FeePaymentMethod` interface directly — modeled on `SponsoredFeePaymentMethod`
 * (no-arg) and `FeeJuicePaymentMethodWithClaim` (claim args). In both, the FPC is the
 * fee payer, so `getFeePayer()` returns the FPC address and the execution payload's
 * single call runs in the tx's setup phase.
 */
import type { FeePaymentMethod } from "@aztec/aztec.js/fee";
import { FunctionCall, FunctionSelector, FunctionType } from "@aztec/stdlib/abi";
import { AztecAddress } from "@aztec/stdlib/aztec-address";
import type { GasSettings } from "@aztec/stdlib/gas";
import { ExecutionPayload } from "@aztec/stdlib/tx";
import { Fr } from "@aztec/aztec.js/fields";

/**
 * The bridge claim credentials that `fee_entrypoint_with_topup` consumes. Matches the
 * shape returned by the bridge helper (and aztec.js's `L2AmountClaim`).
 */
export interface FeeJuiceClaim {
  claimAmount: bigint;
  claimSecret: Fr;
  messageLeafIndex: bigint;
}

/**
 * Pay with an *existing* deposit: calls the no-arg `fee_entrypoint()`, which debits
 * the caller's balance note by the max fee. Fails if the caller has no balance — use
 * `PrivateFeeJuiceTopupPaymentMethod` to fund first.
 */
export class PrivateFeeJuicePaymentMethod implements FeePaymentMethod {
  // NB: explicit field (not a `private fpc` parameter property) so this module also runs
  // under Node's strip-only TS (used by `scripts/deploy.ts`), which rejects those.
  private readonly fpc: AztecAddress;

  constructor(fpc: AztecAddress) {
    this.fpc = fpc;
  }

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for the PrivateFeeJuice FPC.");
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.fpc);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: "fee_entrypoint",
          to: this.fpc,
          selector: await FunctionSelector.fromSignature("fee_entrypoint()"),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [],
          returnTypes: [],
        }),
      ],
      [],
      [],
      [],
      this.fpc, // feePayer
    );
  }

  getGasSettings(): GasSettings | undefined {
    return undefined;
  }
}

/**
 * Fund and pay in one tx: calls `fee_entrypoint_with_topup(amount, secret,
 * message_leaf_index)`, which consumes an L1→L2 Fee Juice claim destined for the FPC
 * (crediting the caller's balance note by `amount`) and then debits the max fee. Used
 * for a visitor's first vote, when they have no balance yet.
 */
export class PrivateFeeJuiceTopupPaymentMethod implements FeePaymentMethod {
  // Explicit fields (not parameter properties) — see note above re: Node strip-only TS.
  private readonly fpc: AztecAddress;
  private readonly claim: FeeJuiceClaim;

  constructor(fpc: AztecAddress, claim: FeeJuiceClaim) {
    this.fpc = fpc;
    this.claim = claim;
  }

  getAsset(): Promise<AztecAddress> {
    throw new Error("Asset is not required for the PrivateFeeJuice FPC.");
  }

  getFeePayer(): Promise<AztecAddress> {
    return Promise.resolve(this.fpc);
  }

  async getExecutionPayload(): Promise<ExecutionPayload> {
    return new ExecutionPayload(
      [
        FunctionCall.from({
          name: "fee_entrypoint_with_topup",
          to: this.fpc,
          selector: await FunctionSelector.fromSignature(
            "fee_entrypoint_with_topup(u128,Field,Field)",
          ),
          type: FunctionType.PRIVATE,
          hideMsgSender: false,
          isStatic: false,
          args: [
            new Fr(this.claim.claimAmount),
            this.claim.claimSecret,
            new Fr(this.claim.messageLeafIndex),
          ],
          returnTypes: [],
        }),
      ],
      [],
      [],
      [],
      this.fpc, // feePayer
    );
  }

  getGasSettings(): GasSettings | undefined {
    return undefined;
  }
}
