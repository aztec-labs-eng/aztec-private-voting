import { style } from "@vanilla-extract/css";
import { vars } from "../theme.css.ts";

export const card = style({
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
});

export const title = style({
  margin: 0,
  fontSize: "14px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: vars.color.muted,
});

export const list = style({ display: "flex", flexDirection: "column" });

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: "12px",
  padding: "10px 0",
  borderTop: `1px solid ${vars.color.border}`,
  fontSize: "14px",
});

export const dot = style({ width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0 });
export const who = style({ fontWeight: 600, flex: 1 });
export const tally = style({ fontFamily: vars.font.mono, color: vars.color.accent });
export const meta = style({ fontFamily: vars.font.mono, fontSize: "12px", color: vars.color.muted });
export const empty = style({ fontSize: "13px", color: vars.color.muted, fontFamily: vars.font.mono });
