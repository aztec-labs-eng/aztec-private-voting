import { vars } from "../theme.css.ts";

export interface Slice {
  name: string;
  value: number;
  color: string;
}

/**
 * Minimal SVG donut chart of the public tally. No chart library — just stacked
 * stroked circles, one arc per candidate.
 */
export function VoteChart({ slices, size = 180 }: { slices: Slice[]; size?: number }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const cx = size / 2;

  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Vote distribution">
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={vars.color.border} strokeWidth={14} />
      {total > 0 &&
        slices.map((s) => {
          const frac = s.value / total;
          const seg = (
            <circle
              key={s.name}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={14}
              strokeDasharray={`${frac * c} ${c - frac * c}`}
              strokeDashoffset={-offset * c}
              transform={`rotate(-90 ${cx} ${cx})`}
              strokeLinecap="butt"
            />
          );
          offset += frac;
          return seg;
        })}
      <text x={cx} y={cx - 4} textAnchor="middle" fontSize={28} fontWeight={700} fill={vars.color.text}>
        {total}
      </text>
      <text x={cx} y={cx + 18} textAnchor="middle" fontSize={12} fill={vars.color.muted}>
        {total === 1 ? "vote" : "votes"}
      </text>
    </svg>
  );
}
