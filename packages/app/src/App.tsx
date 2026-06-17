import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type VotingClient,
  type SetupPhase,
  type VoteEvent,
} from "./aztec/voting_client.ts";
import { loadDeployments } from "./aztec/deployment.ts";
import { useConnections } from "./connection.ts";
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

export default function App() {
  // The network the user has chosen. With more than one deployment we start with
  // *no* selection, so nothing connects until the user picks one in the modal —
  // picking a dead local network is then a choice, not a forced failure that hides
  // a perfectly good testnet deployment.
  const [network, setNetwork] = useState<string | null>(
    deployments.length === 1 ? deployments[0].network : null,
  );
  const deployment = useMemo(
    () => deployments.find((d) => d.network === network) ?? null,
    [network],
  );

  const { conns, reset } = useConnections(deployment);
  const conn = network ? conns[network] : undefined;

  // Purely a UI affordance: which networks the user has clicked past the setup
  // modal for ("Enter the booth"). Not part of the connection state — it just
  // gives the user a beat to read the modal before the app takes over.
  const [entered, setEntered] = useState<Record<string, boolean>>({});

  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [feed, setFeed] = useState<VoteEvent[]>([]);
  // The candidate *this* account voted for, read back from the private `Vote`
  // event the contract delivered to us. null = haven't voted in this election.
  const [myVote, setMyVote] = useState<bigint | null>(null);
  const [loadingTally, setLoadingTally] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  // Everything the UI needs, derived from the active network's connection state.
  const phase: SetupPhase = conn?.phase ?? "connect";
  const ready = conn?.phase === "done" ? conn.client : null;
  const dismissed = ready !== null && network !== null && !!entered[network];
  const setupError = conn?.phase === "error" ? conn.message : null;
  const candidates = deployment?.candidates ?? [];

  // Read-only refresh of the public tally + TallyUpdated feed + our own private
  // vote. `silent` skips the loading indicator so the background poll doesn't
  // flicker the UI.
  const load = useCallback(
    async (client: VotingClient, opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoadingTally(true);
      try {
        const [t, f, mv] = await Promise.all([
          client.readTallies(),
          client.getFeed(),
          client.getMyVote(),
        ]);
        setTallies(t);
        setFeed(f);
        setMyVote(mv);
      } catch {
        /* transient read error; the next poll will retry */
      } finally {
        if (!opts?.silent) setLoadingTally(false);
      }
    },
    [],
  );

  // Reset the board on a network switch, and load it once we're connected.
  // (Connecting itself is handled by useConnections above.)
  useEffect(() => {
    setTallies({});
    setFeed([]);
    setMyVote(null);
    setVoteError(null);
    if (ready) void load(ready);
  }, [ready, load]);

  // Poll the tally + feed so votes from other sessions show up. Paused while a
  // vote is in flight (`busy`) so refreshes don't pile up during proving/sending;
  // the vote does its own refresh on completion and polling resumes after.
  useEffect(() => {
    if (!ready || busy) return;
    const t = setInterval(() => void load(ready, { silent: true }), 5000);
    return () => clearInterval(t);
  }, [ready, busy, load]);

  const vote = useCallback(
    async (candidateId: string) => {
      if (!ready) return;
      setBusy(candidateId);
      setVoteError(null);
      try {
        await ready.vote(BigInt(candidateId));
        await load(ready);
      } catch (err) {
        setVoteError(
          `Couldn't cast that vote: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        setBusy(null);
      }
    },
    [ready, load],
  );

  const selectNetwork = (net: string) => {
    if (conns[net]?.phase === "error") reset(net); // re-pick a failed network => retry
    setNetwork(net);
  };
  const backToChooser = () => {
    if (network) reset(network);
    setNetwork(null);
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
            Start a local network and run <code>npm run deploy</code>, then
            reload.
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
    candidates.find((c) => c.id === candidateId.toString())?.name ??
    `#${candidateId}`;
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
      {!dismissed && (
        <SetupModal
          networks={deployments.map((d) => ({
            key: d.network,
            network: d.network,
            nodeUrl: d.nodeUrl,
          }))}
          selectedKey={network}
          phase={phase}
          error={setupError}
          onSelect={selectNetwork}
          onBack={backToChooser}
          onEnter={() => network && setEntered((m) => ({ ...m, [network]: true }))}
        />
      )}

      {busy && <VoteModal candidateName={nameOf(BigInt(busy))} />}

      {voteError && (
        <ErrorModal message={voteError} onDismiss={() => setVoteError(null)} />
      )}

      <main className={css.page}>
        <header className={css.header}>
          <h1 className={css.h1}>Private Voting</h1>
          <p className={css.lede}>
            Cast your vote in private &mdash; nobody learns who you picked. Only
            the public tally below ever changes, and a nullifier stops anyone
            from voting twice.
          </p>
          {deployment && (
            <div className={css.controls}>
              {deployments.length > 1 && (
                <label className={css.networkPick}>
                  network
                  <select
                    className={css.select}
                    value={network ?? ""}
                    onChange={(e) => selectNetwork(e.target.value)}
                  >
                    {deployments.map((d) => (
                      <option key={d.network} value={d.network}>
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
                  {loadingTally
                    ? "↻ reading tally (simulating get_tally)…"
                    : "live tally"}
                </span>
              </div>

              <div className={css.candidateColumn}>
                {candidates.map((c, i) => {
                  const value = tallies[c.id] ?? 0;
                  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                  const color = COLORS[i % COLORS.length];
                  const votedForThis =
                    myVote !== null && myVote === BigInt(c.id);
                  return (
                    <div
                      className={css.candidateCard}
                      style={{ borderTopColor: color }}
                      key={c.id}
                    >
                      <div className={css.candidateHead}>
                        <span className={css.name}>{c.name}</span>
                        <div className={css.countRow}>
                          <span className={css.count}>
                            {value} {value === 1 ? "vote" : "votes"} · {pct}%
                          </span>
                          {votedForThis && (
                            <span className={css.votedTag} style={{ background: color }}>
                              ✓ your private vote
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Voting stays enabled even after you've voted: a second
                          attempt lets the app showcase the protocol rejecting the
                          duplicate nullifier. */}
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
              {ready && (
                <span className={css.addr}>
                  voting as {ready.address.toString()}
                </span>
              )}
            </footer>
          </>
        )}
      </main>
    </>
  );
}
