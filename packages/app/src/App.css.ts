import { style } from "@vanilla-extract/css";
import { vars } from "./theme.css.ts";

export const page = style({
  maxWidth: "860px",
  margin: "0 auto",
  padding: "56px 24px",
  display: "flex",
  flexDirection: "column",
  gap: "24px",
});

export const header = style({ display: "flex", flexDirection: "column", gap: "10px" });
export const h1 = style({ margin: 0, fontSize: "32px", letterSpacing: "-0.02em" });
export const lede = style({ margin: 0, color: vars.color.muted, lineHeight: 1.55, maxWidth: "60ch" });

export const controls = style({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
});
export const networkPick = style({
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  fontSize: "13px",
  fontFamily: vars.font.mono,
  color: vars.color.muted,
});
export const select = style({
  appearance: "none",
  background: vars.color.surface,
  color: vars.color.text,
  border: `1px solid ${vars.color.border}`,
  borderRadius: "999px",
  padding: "6px 14px",
  fontFamily: vars.font.mono,
  fontSize: "13px",
  cursor: "pointer",
});

const cardBase = {
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
} as const;

export const chartCard = style({
  ...cardBase,
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
});
export const simulating = style({
  fontSize: "12px",
  fontFamily: vars.font.mono,
  color: vars.color.muted,
  selectors: { "&[data-active='true']": { color: vars.color.accent } },
});

export const board = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "20px",
  alignItems: "stretch",
  "@media": { "screen and (max-width: 640px)": { gridTemplateColumns: "1fr" } },
});

export const candidateColumn = style({ display: "flex", flexDirection: "column", gap: "16px" });

export const candidateCard = style({
  ...cardBase,
  borderTop: `3px solid ${vars.color.border}`,
  padding: "18px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
  justifyContent: "space-between",
});

export const candidateHead = style({ display: "flex", flexDirection: "column", gap: "4px" });
export const name = style({ fontWeight: 700, fontSize: "17px" });
export const count = style({ fontFamily: vars.font.mono, fontSize: "13px", color: vars.color.muted });

export const button = style({
  appearance: "none",
  border: "none",
  borderRadius: vars.radius.md,
  padding: "10px 14px",
  width: "100%",
  fontWeight: 700,
  cursor: "pointer",
  background: vars.color.accent,
  color: vars.color.accentText,
  transition: "opacity 0.15s",
  selectors: { "&:disabled": { opacity: 0.35, cursor: "not-allowed" } },
});

export const votedBadge = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  padding: "10px 14px",
  borderRadius: vars.radius.md,
  border: `1px dashed ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: "13px",
  fontWeight: 700,
});

export const footer = style({ display: "flex", flexDirection: "column", gap: "6px" });
export const status = style({ fontSize: "13px", color: vars.color.muted, fontFamily: vars.font.mono });
export const errorText = style({ color: vars.color.error, fontSize: "13px" });
export const addr = style({ fontFamily: vars.font.mono, fontSize: "12px", color: vars.color.muted, wordBreak: "break-all" });

export const hint = style({
  ...cardBase,
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
});
