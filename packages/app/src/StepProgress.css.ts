import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { vars } from "./theme.css.ts";

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

const pulse = keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.35 },
});

export const dot = style({
  width: "22px",
  height: "22px",
  borderRadius: "50%",
  flexShrink: 0,
  display: "grid",
  placeItems: "center",
  fontSize: "13px",
  fontWeight: 700,
  border: `2px solid ${vars.color.border}`,
});

export const dotState = styleVariants({
  pending: { color: vars.color.muted },
  active: {
    borderColor: vars.color.accent,
    color: vars.color.accent,
    animation: `${pulse} 1.1s ease-in-out infinite`,
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
