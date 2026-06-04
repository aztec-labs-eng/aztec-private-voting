import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "../theme.css.ts";

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

export const backdrop = style({
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(6px)",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  zIndex: 70,
  animation: `${fadeIn} 0.2s ease`,
});

export const dialog = style({
  width: "100%",
  maxWidth: "440px",
  background: vars.color.surface,
  border: `1px solid ${vars.color.error}`,
  borderRadius: vars.radius.lg,
  padding: "28px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
});

export const icon = style({
  fontSize: "26px",
  width: "44px",
  height: "44px",
  borderRadius: "50%",
  display: "grid",
  placeItems: "center",
  background: "rgba(248,113,113,0.12)",
  color: vars.color.error,
});

export const title = style({ margin: 0, fontSize: "19px" });

export const message = style({
  margin: 0,
  fontFamily: vars.font.mono,
  fontSize: "13px",
  lineHeight: 1.5,
  color: vars.color.muted,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: "240px",
  overflowY: "auto",
});

export const button = style({
  appearance: "none",
  border: "none",
  borderRadius: vars.radius.md,
  padding: "12px 16px",
  fontWeight: 700,
  fontSize: "15px",
  cursor: "pointer",
  background: vars.color.accent,
  color: vars.color.accentText,
  alignSelf: "flex-start",
});
