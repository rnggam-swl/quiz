import type { CSSProperties } from "react";

import { parseHex, readableTextColor } from "./color";

export type QuizTheme = { primary?: string; bg?: string };

/** Quiz theme presets (from the prototype). Default Indigo darkened for contrast (docs/05). */
export const THEME_PRESETS = [
  { name: "Indigo", primary: "#4f5bea", bg: "#f0f0f5" },
  { name: "Emerald", primary: "#10b981", bg: "#f0fdf4" },
  { name: "Amber", primary: "#f59e0b", bg: "#fffbeb" },
  { name: "Rose", primary: "#ef4444", bg: "#fef2f2" },
  { name: "Violet", primary: "#8b5cf6", bg: "#faf5ff" },
  { name: "Sky", primary: "#0ea5e9", bg: "#f0f9ff" },
  { name: "Pink", primary: "#ec4899", bg: "#fdf2f8" },
  { name: "Slate", primary: "#1a1a24", bg: "#f8f8fa" },
] as const;

export const DEFAULT_THEME = THEME_PRESETS[0];

/** CSS variables for a quiz theme, including a readable text colour on the primary. */
export function themeStyle(theme: QuizTheme | null | undefined): CSSProperties {
  const primary = theme?.primary && parseHex(theme.primary) ? theme.primary : DEFAULT_THEME.primary;
  const bg = theme?.bg && parseHex(theme.bg) ? theme.bg : DEFAULT_THEME.bg;
  return {
    "--theme-primary": primary,
    "--on-theme": readableTextColor(primary),
    "--theme-bg": bg,
  } as CSSProperties;
}
