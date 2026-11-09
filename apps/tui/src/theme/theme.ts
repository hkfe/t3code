import type { ThreadLabelColor } from "@t3tools/contracts";

/**
 * The fork's warm dark palette. Syntax roles copy apps/web/src/lib/warmSyntaxTheme.ts;
 * label colors are the Tailwind 300 shades ThreadLabelPills uses in dark mode.
 */
export const theme = {
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
} as const;
