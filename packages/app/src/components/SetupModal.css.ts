import { keyframes, style } from "@vanilla-extract/css";
import { vars } from "../theme.css.ts";

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const slideUp = keyframes({
  from: { opacity: 0, transform: "translateY(8px)" },
  to: { opacity: 1, transform: "translateY(0)" },
});

export const backdrop = style({
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.6)",
  backdropFilter: "blur(4px)",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  zIndex: 50,
  animation: `${fadeIn} 0.2s ease`,
});

export const dialog = style({
  width: "100%",
  maxWidth: "440px",
  background: vars.color.surface,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.lg,
  padding: "28px",
  display: "flex",
  flexDirection: "column",
  gap: "20px",
  boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
  animation: `${slideUp} 0.25s ease`,
});

export const title = style({ margin: 0, fontSize: "20px" });
export const subtitle = style({ margin: 0, fontSize: "14px", color: vars.color.muted, lineHeight: 1.5 });

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
});

export const errorBox = style({
  fontFamily: vars.font.mono,
  fontSize: "12px",
  color: vars.color.error,
  background: "rgba(248,113,113,0.08)",
  border: `1px solid ${vars.color.error}`,
  borderRadius: vars.radius.sm,
  padding: "10px",
  wordBreak: "break-word",
});

export const secondary = style({
  appearance: "none",
  background: "transparent",
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: "10px 16px",
  fontWeight: 600,
  fontSize: "14px",
  cursor: "pointer",
  color: vars.color.text,
});

export const choices = style({ display: "flex", flexDirection: "column", gap: "10px" });
export const choice = style({
  appearance: "none",
  textAlign: "left",
  background: vars.color.bg,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  padding: "14px 16px",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: "2px",
  transition: "border-color 0.15s",
  selectors: { "&:hover": { borderColor: vars.color.accent } },
});
export const choiceName = style({ fontWeight: 700, fontSize: "15px", textTransform: "capitalize", color: vars.color.accent });
export const choiceUrl = style({ fontFamily: vars.font.mono, fontSize: "12px", color: vars.color.muted });
