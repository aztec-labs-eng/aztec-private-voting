import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "../theme.css.ts";

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const spin = keyframes({ to: { transform: "rotate(360deg)" } });

export const backdrop = style({
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  zIndex: 60,
  animation: `${fadeIn} 0.2s ease`,
});

export const dialog = style({
  width: "100%",
  maxWidth: "420px",
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: "28px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "18px",
  textAlign: "center",
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
});

export const spinner = style({
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  border: `3px solid ${vars.color.border}`,
  borderTopColor: vars.color.accent,
  animation: `${spin} 0.9s linear infinite`,
});

export const title = style({ margin: 0, fontSize: "19px" });
export const subtitle = style({ margin: 0, fontSize: "14px", color: vars.color.muted, lineHeight: 1.5 });

export const steps = style({
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  textAlign: "left",
  width: "100%",
});
export const step = style({ display: "flex", flexDirection: "column", gap: "2px" });
export const stepName = style({ fontWeight: 600, fontSize: "14px" });
export const stepDesc = style({ fontSize: "13px", color: vars.color.muted, lineHeight: 1.4 });
