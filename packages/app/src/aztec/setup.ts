/**
 * Per-deployment bootstrap: connect -> create account -> register contract.
 *
 * Keyed by the deployment's contract address and memoised in module-level maps,
 * so React StrictMode's double-mounted effect can't create two wallets, and
 * switching between deployments (local / testnet / …) reuses each one's session
 * instead of reconnecting. The current phase is an external store the setup modal
 * subscribes to.
 *
 * Reading the tally is deliberately NOT part of setup — it's a normal read-only
 * query the running app does (and re-does after every vote), shown inline in the UI.
 */
import { connect, type Session } from "./wallet.ts";
import { registerVoting, assertVotingPublished, getTally } from "./voting.ts";
import type { Deployment } from "./deployment.ts";
import type { PrivateVotingContract } from "@app/contracts/PrivateVoting";

export type SetupPhase = "connect" | "account" | "register" | "done" | "error";

export interface SetupResult {
  session: Session;
  voting: PrivateVotingContract;
}

const phases = new Map<string, SetupPhase>();
const errors = new Map<string, string | null>();
const setups = new Map<string, Promise<SetupResult>>();
const listeners = new Set<() => void>();

function emit(key: string, phase: SetupPhase) {
  phases.set(key, phase);
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getPhase = (key: string): SetupPhase =>
  phases.get(key) ?? "connect";
export const getError = (key: string): string | null => errors.get(key) ?? null;

/** Forget a deployment's setup so a fresh `startSetup` retries it (e.g. after an error). */
export function resetSetup(key: string): void {
  setups.delete(key);
  errors.delete(key);
  phases.delete(key);
  listeners.forEach((l) => l());
}

export async function readTallies(
  voting: PrivateVotingContract,
  session: Session,
  deployment: Deployment,
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    deployment.candidates.map(
      async (c) =>
        [
          c.id,
          await getTally(voting, session, deployment, BigInt(c.id)),
        ] as const,
    ),
  );
  return Object.fromEntries(entries);
}

export function startSetup(deployment: Deployment): Promise<SetupResult> {
  const key = deployment.contractAddress;
  const existing = setups.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      const session = await connect(deployment.nodeUrl, (ph) => emit(key, ph)); // "connect" -> "account"
      emit(key, "register");
      await assertVotingPublished(session, deployment);
      const voting = await registerVoting(session, deployment);
      emit(key, "done");
      return { session, voting };
    } catch (err) {
      errors.set(key, err instanceof Error ? err.message : String(err));
      emit(key, "error");
      throw err;
    }
  })();
  setups.set(key, p);
  return p;
}
