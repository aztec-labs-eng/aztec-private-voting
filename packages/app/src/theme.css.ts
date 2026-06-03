import { createGlobalTheme, globalStyle } from "@vanilla-extract/css";

/** Dark theme + lime accent, echoing docs.aztec.network. */
export const vars = createGlobalTheme(":root", {
  color: {
    bg: "#0b0b0d",
    surface: "#16161a",
    border: "#2a2a30",
    text: "#f5f5f4",
    muted: "#a1a1aa",
    accent: "#c3f53c",
    accentText: "#0b0b0d",
    ok: "#4ade80",
    error: "#f87171",
  },
  font: {
    body: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
    mono: "ui-monospace, 'SF Mono', 'Cascadia Code', monospace",
  },
  radius: { sm: "6px", md: "10px", lg: "16px" },
});

globalStyle("html, body, #root", {
  margin: 0,
  height: "100%",
  background: vars.color.bg,
  color: vars.color.text,
  fontFamily: vars.font.body,
});

globalStyle("*", { boxSizing: "border-box" });
