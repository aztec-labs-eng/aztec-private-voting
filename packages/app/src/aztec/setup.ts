/**
 * One-shot bootstrap: connect -> create account -> register contract. Kept in a
 * module-level singleton (not a hook) so React StrictMode's double-mounted effect
 * can't create two wallets/accounts. The current phase is exposed as an external
 * store so the setup modal can narrate progress.
 *
 * Reading the tally is deliberately NOT part of setup — it's a normal read-only
 * query the running app does (and re-does after every vote), shown inline in the
 * UI rather than in this one-time modal.
 */
import { connect, type Session } from "./wallet.ts";
import { registerVoting, getTally } from "./voting.ts";
import type { Deployment } from "./deployment.ts";
import type { PrivateVotingContract } from "@app/contracts/PrivateVoting";

export type SetupPhase = "connect" | "account" | "register" | "done" | "error";

export interface SetupResult {
  session: Session;
  voting: PrivateVotingContract;
}

let phase: SetupPhase = "connect";
let error: string | null = null;
const listeners = new Set<() => void>();

function emit(next: SetupPhase) {
  phase = next;
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getPhase = (): SetupPhase => phase;
export const getError = (): string | null => error;

export async function readTallies(
  voting: PrivateVotingContract,
  session: Session,
  deployment: Deployment,
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    deployment.candidates.map(
      async (c) => [c.id, await getTally(voting, session, deployment, BigInt(c.id))] as const,
    ),
  );
  return Object.fromEntries(entries);
}

let started: Promise<SetupResult> | null = null;

export function startSetup(deployment: Deployment): Promise<SetupResult> {
  if (started) return started;
  started = (async () => {
    try {
      const session = await connect(deployment.nodeUrl, emit); // emits "connect" then "account"
      emit("register");
      const voting = await registerVoting(session, deployment);
      emit("done");
      return { session, voting };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      emit("error");
      throw err;
    }
  })();
  return started;
}
