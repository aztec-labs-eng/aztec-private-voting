import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import type { PrivateVotingContract } from "@app/contracts/PrivateVoting";
import { StepProgress, type Step, type StepState } from "./StepProgress.tsx";
import { connect, type Session } from "./wallet.ts";
import { getTally, registerVoting, sendVote, simulateVote } from "./voting.ts";
import { loadDeployment } from "./deployment.ts";
import * as css from "./App.css.ts";

const deployment = loadDeployment();

// The four protocol steps the quickstart walks through.
type StepKey = "connect" | "register" | "simulate" | "send";
const STEP_META: Record<StepKey, { label: string; description: string }> = {
  connect: { label: "Connect", description: "Create an in-browser wallet + account" },
  register: { label: "Register", description: "Teach the PXE about the contract" },
  simulate: { label: "Simulate", description: "Run the private vote locally" },
  send: { label: "Send", description: "Submit the tx; bump the public tally" },
};
const ORDER: StepKey[] = ["connect", "register", "simulate", "send"];

type StepsState = Record<StepKey, StepState>;
const initialSteps: StepsState = { connect: "pending", register: "pending", simulate: "pending", send: "pending" };

type Action =
  | { type: "set"; key: StepKey; state: StepState }
  | { type: "resetVote" };

function reducer(state: StepsState, action: Action): StepsState {
  switch (action.type) {
    case "set":
      return { ...state, [action.key]: action.state };
    case "resetVote":
      // Connect stays done; re-arm the per-vote steps.
      return { ...state, register: "done", simulate: "pending", send: "pending" };
  }
}

export default function App() {
  const [steps, dispatch] = useReducer(reducer, initialSteps);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const votingRef = useRef<PrivateVotingContract | null>(null);

  const candidates = useMemo(() => deployment?.candidates ?? [], []);

  // CONNECT + REGISTER on load.
  useEffect(() => {
    if (!deployment) return;
    let cancelled = false;
    (async () => {
      try {
        dispatch({ type: "set", key: "connect", state: "active" });
        const s = await connect(deployment.nodeUrl);
        if (cancelled) return;
        setSession(s);
        dispatch({ type: "set", key: "connect", state: "done" });

        dispatch({ type: "set", key: "register", state: "active" });
        votingRef.current = await registerVoting(s, deployment);
        dispatch({ type: "set", key: "register", state: "done" });

        await refreshTallies(s);
      } catch (err) {
        if (!cancelled) fail(err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fail(err: unknown) {
    const active = ORDER.find((k) => steps[k] === "active");
    if (active) dispatch({ type: "set", key: active, state: "error" });
    setError(err instanceof Error ? err.message : String(err));
    setBusy(false);
  }

  const refreshTallies = useCallback(
    async (s: Session) => {
      const voting = votingRef.current;
      if (!voting || !deployment) return;
      const entries = await Promise.all(
        candidates.map(async (c) => [c, await getTally(voting, s, deployment, BigInt(c))] as const),
      );
      setTallies(Object.fromEntries(entries));
    },
    [candidates],
  );

  const vote = useCallback(
    async (candidate: string) => {
      const voting = votingRef.current;
      if (!session || !voting || !deployment) return;
      setBusy(true);
      setError(null);
      dispatch({ type: "resetVote" });
      try {
        dispatch({ type: "set", key: "simulate", state: "active" });
        await simulateVote(voting, session, deployment, BigInt(candidate));
        dispatch({ type: "set", key: "simulate", state: "done" });

        dispatch({ type: "set", key: "send", state: "active" });
        await sendVote(voting, session, deployment, BigInt(candidate));
        dispatch({ type: "set", key: "send", state: "done" });

        await refreshTallies(session);
      } catch (err) {
        fail(err);
        return;
      }
      setBusy(false);
    },
    [session, refreshTallies],
  );

  const stepList: Step[] = ORDER.map((key) => ({ key, ...STEP_META[key], state: steps[key] }));
  const ready = !!session && steps.register === "done";

  return (
    <main className={css.page}>
      <header>
        <h1 className={css.h1}>Private Voting</h1>
        <p className={css.lede}>
          Your vote is cast in private; only the public tally changes. A nullifier stops anyone
          from voting twice without revealing who voted.
        </p>
      </header>

      {!deployment ? (
        <div className={css.card}>
          <strong>No deployment found.</strong>
          <span className={css.status}>
            Start a sandbox and run <code>npm run deploy</code>, then reload.
          </span>
        </div>
      ) : (
        <div className={css.grid}>
          <section className={css.card}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Candidates</h2>
            {candidates.map((c) => (
              <div className={css.candidate} key={c}>
                <button className={css.button} disabled={!ready || busy} onClick={() => vote(c)}>
                  Vote #{c}
                </button>
                <span className={css.tally}>{tallies[c] ?? 0}</span>
              </div>
            ))}
            {error && <span className={css.errorText}>{error}</span>}
            {session && <span className={css.addr}>you: {session.address.toString()}</span>}
          </section>

          <section>
            <StepProgress steps={stepList} />
          </section>
        </div>
      )}
    </main>
  );
}
