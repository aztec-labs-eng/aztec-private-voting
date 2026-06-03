import { style } from "@vanilla-extract/css";
import { vars } from "./theme.css.ts";

export const page = style({
  maxWidth: "760px",
  margin: "0 auto",
  padding: "48px 24px",
  display: "flex",
  flexDirection: "column",
  gap: "28px",
});

export const h1 = style({ margin: 0, fontSize: "28px" });
export const lede = style({ margin: 0, color: vars.color.muted, lineHeight: 1.5 });

export const grid = style({
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "20px",
  "@media": { "screen and (max-width: 640px)": { gridTemplateColumns: "1fr" } },
});

export const card = style({
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
});

export const candidate = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "12px",
});

export const tally = style({
  fontFamily: vars.font.mono,
  fontSize: "20px",
  fontWeight: 700,
  color: vars.color.accent,
  minWidth: "2ch",
  textAlign: "right",
});

export const button = style({
  appearance: "none",
  border: "none",
  borderRadius: vars.radius.md,
  padding: "10px 16px",
  fontWeight: 700,
  cursor: "pointer",
  background: vars.color.accent,
  color: vars.color.accentText,
  transition: "opacity 0.15s",
  selectors: {
    "&:disabled": { opacity: 0.4, cursor: "not-allowed" },
  },
});

export const status = style({ fontSize: "13px", color: vars.color.muted, fontFamily: vars.font.mono });
export const errorText = style({ color: vars.color.error, fontSize: "13px" });
export const addr = style({ fontFamily: vars.font.mono, fontSize: "12px", color: vars.color.muted, wordBreak: "break-all" });
