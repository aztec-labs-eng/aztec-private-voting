import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { vars } from "../theme.css.ts";

export const panel = style({
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: "14px",
});

export const row = style({
  display: "flex",
  alignItems: "center",
  gap: "12px",
});

const spin = keyframes({ to: { transform: "rotate(360deg)" } });

export const dot = style({
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  flexShrink: 0,
  boxSizing: "border-box",
  display: "grid",
  placeItems: "center",
  lineHeight: 1,
  fontSize: "13px",
  fontWeight: 700,
  border: `2px solid ${vars.color.border}`,
});

export const dotState = styleVariants({
  pending: { color: vars.color.muted },
  // The active dot is the spinner itself — one accent arc on the ring, rotating.
  // No glyph, so nothing to mis-align vertically.
  active: {
    borderTopColor: vars.color.accent,
    animation: `${spin} 0.8s linear infinite`,
  },
  done: {
    borderColor: vars.color.ok,
    background: vars.color.ok,
    color: vars.color.accentText,
  },
  error: { borderColor: vars.color.error, color: vars.color.error },
});

export const labels = style({ display: "flex", flexDirection: "column" });

export const label = style({ fontWeight: 600 });
export const labelState = styleVariants({
  pending: { color: vars.color.muted },
  active: { color: vars.color.text },
  done: { color: vars.color.text },
  error: { color: vars.color.error },
});

export const desc = style({ fontSize: "13px", color: vars.color.muted });
