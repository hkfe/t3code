import type { ProjectIconColor, ThreadLabelColor } from "@t3tools/contracts";

export type ColorMode = "none" | "ansi16" | "rich";
export type Background = "dark" | "light";

/**
 * Mirrors chalk's level detection (Ink colors through chalk): "rich" is 256 colors or more, where
 * chalk maps hex well; at 16 colors it would map most of our hexes to black or white.
 */
export function detectColorMode(env: NodeJS.ProcessEnv): ColorMode {
  if (env.NO_COLOR) return "none";
  const forced = env.FORCE_COLOR ?? "";
  if (/^\d+$/.test(forced)) return forced === "0" ? "none" : forced === "1" ? "ansi16" : "rich";
  const term = env.TERM ?? "";
  if (env.WT_SESSION || env.COLORTERM === "truecolor") return "rich";
  if (/^(?:xterm-kitty|xterm-ghostty|wezterm)$|-256(?:color)?$/i.test(term)) return "rich";
  if (env.TERM_PROGRAM === "iTerm.app" || env.TERM_PROGRAM === "Apple_Terminal") return "rich";
  return "ansi16";
}

/** `T3_TUI_THEME` wins, then `COLORFGBG` ("15;0": light text on a dark background). */
export function detectBackground(env: NodeJS.ProcessEnv): Background {
  if (env.T3_TUI_THEME === "light" || env.T3_TUI_THEME === "dark") return env.T3_TUI_THEME;
  const bg = Number(env.COLORFGBG?.split(";").at(-1));
  return bg === 7 || (bg >= 9 && bg <= 15) ? "light" : "dark";
}

/** Without unicode (no UTF-8 locale, or `T3_TUI_ASCII=1`), output is folded to ASCII. */
export function detectUnicode(env: NodeJS.ProcessEnv): boolean {
  if (env.T3_TUI_ASCII === "1") return false;
  // Windows Terminal (WT_SESSION) draws unicode without a UTF-8 locale.
  if (env.T3_TUI_ASCII === "0" || env.WT_SESSION) return true;
  const locale = env.LC_ALL || env.LC_CTYPE || env.LANG || "";
  return env.TERM !== "linux" && /utf-?8/i.test(locale);
}

/**
 * The fork's warm dark palette. Syntax roles copy apps/web/src/lib/warmSyntaxTheme.ts;
 * label colors are the Tailwind 300 shades ThreadLabelPills uses in dark mode.
 */
const dark = {
  text: "#e6ddd3",
  textMuted: "#a39a91",
  textFaint: "#7a726b",
  border: "#3a3530",
  borderFocused: "#ff8a4c",
  accent: "#ff8a4c",
  selection: "#2e2925",
  success: "#b5d78c",
  warning: "#f0c674",
  danger: "#ff7a6b",
  info: "#7cc4fa",
  syntax: {
    comments: "#7a726b",
    strings: "#b5d78c",
    escapes: "#f9a970",
    regex: "#8fd1c4",
    constants: "#f0c674",
    numbersBooleans: "#f0c674",
    keywords: "#ff8a4c",
    operators: "#c8bfb6",
    functions: "#7cc4fa",
    typesComponents: "#c9a6ff",
    variablesProperties: "#e6ddd3",
    thisBuiltinsNamespaces: "#f9a970",
    parameters: "#d4ccc4",
    tags: "#ff9e64",
    attributes: "#8fd1c4",
    punctuation: "#857d76",
  },
  /** Line and changed-word backgrounds of diffs: success and danger, darkened onto the panel. */
  diff: {
    addedBg: "#26301f",
    addedWordBg: "#3d5230",
    removedBg: "#3a2421",
    removedWordBg: "#5e322b",
  },
  label: {
    gray: "#d4d4d8",
    red: "#fca5a5",
    orange: "#fdba74",
    amber: "#fcd34d",
    green: "#86efac",
    teal: "#5eead4",
    blue: "#93c5fd",
    violet: "#c4b5fd",
    pink: "#f9a8d4",
  } satisfies Record<ThreadLabelColor, string>,
  /** Project icon colors: the Tailwind 400 shades web uses in dark mode. */
  project: {
    gray: "#9ca3af",
    red: "#f87171",
    orange: "#fb923c",
    amber: "#fbbf24",
    yellow: "#facc15",
    lime: "#a3e635",
    green: "#4ade80",
    emerald: "#34d399",
    teal: "#2dd4bf",
    cyan: "#22d3ee",
    sky: "#38bdf8",
    blue: "#60a5fa",
    indigo: "#818cf8",
    violet: "#a78bfa",
    purple: "#c084fc",
    fuchsia: "#e879f9",
    pink: "#f472b6",
    rose: "#fb7185",
  } satisfies Record<ProjectIconColor, string>,
};

type Theme = typeof dark;

/** The same roles on a light background; labels are ThreadLabelPills' light-mode shades. */
const light: Theme = {
  text: "#2b2520",
  textMuted: "#6b625a",
  textFaint: "#968c83",
  border: "#d9d0c7",
  borderFocused: "#c4541c",
  accent: "#c4541c",
  selection: "#efe6dc",
  success: "#4f7a28",
  warning: "#946200",
  danger: "#c4382b",
  info: "#1d6ea8",
  syntax: {
    comments: "#968c83",
    strings: "#4f7a28",
    escapes: "#b0561d",
    regex: "#227a6b",
    constants: "#946200",
    numbersBooleans: "#946200",
    keywords: "#c4541c",
    operators: "#6b625a",
    functions: "#1d6ea8",
    typesComponents: "#7a4cc2",
    variablesProperties: "#2b2520",
    thisBuiltinsNamespaces: "#b0561d",
    parameters: "#4a423b",
    tags: "#c4541c",
    attributes: "#227a6b",
    punctuation: "#857b72",
  },
  diff: {
    addedBg: "#e6f0da",
    addedWordBg: "#c9e0b0",
    removedBg: "#f7e1dd",
    removedWordBg: "#efc0b8",
  },
  label: {
    gray: "#52525b",
    red: "#dc2626",
    orange: "#ea580c",
    amber: "#b45309",
    green: "#15803d",
    teal: "#0f766e",
    blue: "#2563eb",
    violet: "#7c3aed",
    pink: "#db2777",
  },
  project: {
    gray: "#4b5563",
    red: "#dc2626",
    orange: "#ea580c",
    amber: "#d97706",
    yellow: "#ca8a04",
    lime: "#65a30d",
    green: "#16a34a",
    emerald: "#059669",
    teal: "#0d9488",
    cyan: "#0891b2",
    sky: "#0284c7",
    blue: "#2563eb",
    indigo: "#4f46e5",
    violet: "#7c3aed",
    purple: "#9333ea",
    fuchsia: "#c026d3",
    pink: "#db2777",
    rose: "#e11d48",
  },
};

/**
 * 16 colors: the terminal's own palette, which already suits its background. "" is the default
 * foreground. Diffs lose their backgrounds and keep their +/- colors.
 */
function ansi16(background: Background): Theme {
  const muted = "gray";
  const accent = background === "light" ? "magenta" : "yellow";
  return {
    text: "",
    textMuted: muted,
    textFaint: muted,
    border: muted,
    borderFocused: accent,
    accent,
    selection: background === "light" ? "white" : "gray",
    success: "green",
    warning: "yellow",
    danger: "red",
    info: "cyan",
    syntax: {
      comments: muted,
      strings: "green",
      escapes: "yellow",
      regex: "cyan",
      constants: "yellow",
      numbersBooleans: "yellow",
      keywords: "magenta",
      operators: "",
      functions: "blue",
      typesComponents: "cyan",
      variablesProperties: "",
      thisBuiltinsNamespaces: "yellow",
      parameters: "",
      tags: "magenta",
      attributes: "cyan",
      punctuation: muted,
    },
    diff: { addedBg: "", addedWordBg: "", removedBg: "", removedWordBg: "" },
    label: {
      gray: muted,
      red: "red",
      orange: "yellow",
      amber: "yellow",
      green: "green",
      teal: "cyan",
      blue: "blue",
      violet: "magenta",
      pink: "magenta",
    },
    project: {
      gray: muted,
      red: "red",
      orange: "yellow",
      amber: "yellow",
      yellow: "yellow",
      lime: "green",
      green: "green",
      emerald: "green",
      teal: "cyan",
      cyan: "cyan",
      sky: "cyan",
      blue: "blue",
      indigo: "blue",
      violet: "magenta",
      purple: "magenta",
      fuchsia: "magenta",
      pink: "magenta",
      rose: "red",
    },
  };
}

function pickTheme(mode: ColorMode, background: Background): Theme {
  if (mode === "ansi16") return ansi16(background);
  const palette = background === "light" ? light : dark;
  // NO_COLOR: output.ts drops every color and shows backgrounds as reverse video, so only the
  // selection may keep one.
  if (mode === "none") return { ...palette, diff: ansi16(background).diff };
  return palette;
}

export const colorMode = detectColorMode(process.env);
export const unicode = detectUnicode(process.env);
export const theme: Theme = pickTheme(colorMode, detectBackground(process.env));
