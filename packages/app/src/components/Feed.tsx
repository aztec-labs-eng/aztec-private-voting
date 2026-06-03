import * as css from "./Feed.css.ts";

export interface FeedRow {
  key: string;
  name: string;
  color: string;
  tally: bigint;
  blockNumber: number;
  txShort: string;
}

/** Live feed of public VoteCast events, newest first. */
export function Feed({ rows }: { rows: FeedRow[] }) {
  return (
    <div className={css.card}>
      <h2 className={css.title}>Live feed · public VoteCast events</h2>
      {rows.length === 0 ? (
        <span className={css.empty}>No votes yet — cast one above.</span>
      ) : (
        <div className={css.list}>
          {rows.map((r) => (
            <div className={css.row} key={r.key}>
              <span className={css.dot} style={{ background: r.color }} />
              <span className={css.who}>Vote for {r.name}</span>
              <span className={css.tally}>tally → {r.tally.toString()}</span>
              <span className={css.meta}>
                block #{r.blockNumber} · {r.txShort}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
