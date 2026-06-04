import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { sendVote, getVoteFeed, type VoteEvent } from "./aztec/voting.ts";
import { loadDeployments } from "./aztec/deployment.ts";
import {
  startSetup,
  resetSetup,
  subscribe,
  getPhase,
  getError,
  readTallies,
  type SetupResult,
} from "./aztec/setup.ts";
import { SetupModal } from "./components/SetupModal.tsx";
import { VoteChart, type Slice } from "./components/VoteChart.tsx";
import { Feed, type FeedRow } from "./components/Feed.tsx";
import { VoteModal } from "./components/VoteModal.tsx";
import { ErrorModal } from "./components/ErrorModal.tsx";
import { vars } from "./theme.css.ts";
import * as css from "./App.css.ts";

const deployments = loadDeployments();

// Candidate colors, by position.
const COLORS = [vars.color.accent, "#5ec8f0", "#f06ec8", "#f5b53c"];

function formatRemaining(ms: number): string {
  if (ms <= 0) return "Voting closed";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m ${s % 60}s left`;
}

function useCountdown(deadline: string | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!deadline) return null;
  return formatRemaining(new Date(deadline).getTime() - now);
}

export default function App() {
  // Active deployment, keyed by contract address. With more than one deployment
  // we start with *no* selection, so nothing connects until the user picks a
  // network in the modal — picking a dead local network is then a choice, not a
  // forced failure that hides a perfectly good testnet deployment.
  const [key, setKey] = useState<string | null>(
    deployments.length === 1 ? deployments[0].contractAddress : null,
  );
  const deployment = useMemo(
    () => deployments.find((d) => d.contractAddress === key) ?? null,
    [key],
  );

  const phase = useSyncExternalStore(
    subscribe,
    () => (key ? getPhase(key) : "connect"),
    () => (key ? getPhase(key) : "connect"),
  );
  const [enteredByKey, setEnteredByKey] = useState<Record<string, boolean>>({});
  const [readyByKey, setReadyByKey] = useState<Record<string, SetupResult>>({});
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<VoteEvent[]>([]);
  const [loadingTally, setLoadingTally] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ready = key ? (readyByKey[key] ?? null) : null;
  const entered = key ? !!enteredByKey[key] : false;
  const candidates = deployment?.candidates ?? [];
  const countdown = useCountdown(deployment?.deadline);
  const closed = countdown === "Voting closed";

  // Read-only refresh of the public tally + VoteCast feed. `silent` skips the
  // loading indicator so the background poll doesn't flicker the UI.
  const load = useCallback(
    async (r: SetupResult, dep: NonNullable<typeof deployment>, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingTally(true);
      try {
        const [t, f] = await Promise.all([
          readTallies(r.voting, r.session, dep),
          getVoteFeed(r.session, dep),
        ]);
        setTallies(t);
        setFeed(f);
      } catch {
        /* transient read error; the next poll will retry */
      } finally {
        if (!opts?.silent) setLoadingTally(false);
      }
    },
    [],
  );

  // Bootstrap the selected deployment (memoised in setup.ts → safe under StrictMode).
  useEffect(() => {
    if (!deployment) return;
    setTallies({});
    setFeed([]);
    setError(null);
    startSetup(deployment)
      .then((result) => {
        setReadyByKey((m) => ({ ...m, [deployment.contractAddress]: result }));
        return load(result, deployment);
      })
      .catch(() => {
        /* error surfaced via the setup store / modal */
      });
  }, [deployment, load]);

  // Poll the tally + feed so votes from other sessions show up. Paused while a
  // vote is in flight (`busy`) so refreshes don't pile up during proving/sending;
  // the vote does its own refresh on completion and polling resumes after.
  useEffect(() => {
    if (!ready || !deployment || busy) return;
    const t = setInterval(() => void load(ready, deployment, { silent: true }), 5000);
    return () => clearInterval(t);
  }, [ready, deployment, busy, load]);

  const vote = useCallback(
    async (candidateId: string) => {
      if (!ready || !deployment) return;
      setBusy(candidateId);
      setError(null);
      try {
        await sendVote(ready.voting, ready.session, deployment, BigInt(candidateId));
        await load(ready, deployment);
      } catch (err) {
        setError(`Couldn't cast that vote: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setBusy(null);
      }
    },
    [ready, deployment, load],
  );

  const selectNetwork = (k: string) => {
    if (getPhase(k) === "error") resetSetup(k); // re-pick a failed network => retry
    setKey(k);
  };
  const backToChooser = () => {
    if (key) resetSetup(key);
    setKey(null);
  };

  if (deployments.length === 0) {
    return (
      <main className={css.page}>
        <header className={css.header}>
          <h1 className={css.h1}>Private Voting</h1>
        </header>
        <div className={css.hint}>
          <strong>No (current) deployment found.</strong>
          <span className={css.status}>
            Start a local network and run <code>npm run deploy</code>, then reload.
          </span>
        </div>
      </main>
    );
  }

  const total = Object.values(tallies).reduce((a, b) => a + b, 0);
  const slices: Slice[] = candidates.map((c, i) => ({
    name: c.name,
    value: tallies[c.id] ?? 0,
    color: COLORS[i % COLORS.length],
  }));

  const colorOf = (candidateId: bigint) => {
    const idx = candidates.findIndex((c) => c.id === candidateId.toString());
    return idx >= 0 ? COLORS[idx % COLORS.length] : vars.color.muted;
  };
  const nameOf = (candidateId: bigint) =>
    candidates.find((c) => c.id === candidateId.toString())?.name ?? `#${candidateId}`;
  const feedRows: FeedRow[] = feed.map((e, i) => ({
    key: `${e.txHash}-${i}`,
    name: nameOf(e.candidate),
    color: colorOf(e.candidate),
    tally: e.tally,
    blockNumber: e.blockNumber,
    txShort: `${e.txHash.slice(0, 10)}…`,
  }));

  return (
    <>
      {!entered && (
        <SetupModal
          networks={deployments.map((d) => ({
            key: d.contractAddress,
            network: d.network,
            nodeUrl: d.nodeUrl,
          }))}
          selectedKey={key}
          phase={phase}
          error={key ? getError(key) : null}
          onSelect={selectNetwork}
          onBack={backToChooser}
          onEnter={() => key && setEnteredByKey((m) => ({ ...m, [key]: true }))}
        />
      )}

      {busy && <VoteModal candidateName={nameOf(BigInt(busy))} />}

      {error && <ErrorModal message={error} onDismiss={() => setError(null)} />}

      <main className={css.page}>
        <header className={css.header}>
          <h1 className={css.h1}>Private Voting</h1>
          <p className={css.lede}>
            Cast your vote in private &mdash; nobody learns who you picked. Only the public tally
            below ever changes, and a nullifier stops anyone from voting twice.
          </p>
          {deployment && (
            <div className={css.controls}>
              <span className={`${css.deadline} ${closed ? "" : css.deadlineHot}`}>
                ⏳ {countdown}
              </span>
              {deployments.length > 1 && (
                <label className={css.networkPick}>
                  network
                  <select
                    className={css.select}
                    value={key ?? ""}
                    onChange={(e) => selectNetwork(e.target.value)}
                  >
                    {deployments.map((d) => (
                      <option key={d.contractAddress} value={d.contractAddress}>
                        {d.network}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          )}
        </header>

        {deployment && (
          <>
            <div className={css.board}>
              <div className={css.chartCard}>
                <VoteChart slices={slices} />
                <span className={css.simulating} data-active={loadingTally}>
                  {loadingTally ? "↻ reading tally (simulating get_tally)…" : "live tally"}
                </span>
              </div>

              <div className={css.candidateColumn}>
                {candidates.map((c, i) => {
                  const value = tallies[c.id] ?? 0;
                  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                  const color = COLORS[i % COLORS.length];
                  return (
                    <div className={css.candidateCard} style={{ borderTopColor: color }} key={c.id}>
                      <div className={css.candidateHead}>
                        <span className={css.name}>{c.name}</span>
                        <span className={css.count}>
                          {value} {value === 1 ? "vote" : "votes"} · {pct}%
                        </span>
                      </div>
                      <button
                        className={css.button}
                        style={{ background: color }}
                        disabled={!ready || busy !== null || closed}
                        onClick={() => vote(c.id)}
                      >
                        {busy === c.id ? "Sending…" : "Vote"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <Feed rows={feedRows} />

            <footer className={css.footer}>
              {ready && <span className={css.addr}>voting as {ready.session.address.toString()}</span>}
            </footer>
          </>
        )}
      </main>
    </>
  );
}
