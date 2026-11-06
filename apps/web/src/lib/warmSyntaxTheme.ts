import { getResolvedOrResolveTheme, registerCustomTheme, type DiffsTheme } from "@pierre/diffs";

/** pierre-dark recolored to a calm, warm palette: plain names stay light, few accents. */
export const WARM_DARK_THEME_NAME = "t3-dark";

// Role: [pierre-dark color, warm color]. Keyed by color, so every scope sharing a role moves together.
const WARM_ROLES = {
  comments: ["#737373", "#7a726b"],
  strings: ["#5ecc71", "#b5d78c"],
  escapes: ["#61d5c0", "#f9a970"],
  regex: ["#64d1db", "#8fd1c4"],
  constants: ["#ffd452", "#f0c674"],
  numbersBooleans: ["#68cdf2", "#f0c674"],
  keywords: ["#ff678d", "#ff8a4c"],
  operators: ["#08c0ef", "#c8bfb6"],
  functions: ["#9d6afb", "#7cc4fa"],
  typesComponents: ["#d568ea", "#c9a6ff"],
  variablesProperties: ["#ffa359", "#e6ddd3"],
  thisBuiltinsNamespaces: ["#ffab16", "#f9a970"],
  parameters: ["#a3a3a3", "#d4ccc4"],
  cssProperties: ["#009fff", "#7cc4fa"],
  tags: ["#ff855e", "#ff9e64"],
  attributesCssClasses: ["#60d199", "#8fd1c4"],
  decorators: ["#69b1ff", "#7cc4fa"],
  punctuation: ["#636363", "#857d76"],
} as const;
const WARM_COLORS = new Map<string, string>(Object.values(WARM_ROLES));

type ZedTheme = NonNullable<DiffsTheme["zed"]>;

function warm(color: string): string {
  return WARM_COLORS.get(color.toLowerCase()) ?? color;
}

function withWarmSyntax(theme: ZedTheme): ZedTheme {
  const syntax = Object.fromEntries(
    Object.entries(theme.style.syntax ?? {}).map(([scope, style]) => {
      if (typeof style === "string") return [scope, warm(style)];
      const recolored = style.color ? { ...style, color: warm(style.color) } : style;
      return [
        scope,
        scope.startsWith("comment") ? { ...recolored, font_style: "italic" } : recolored,
      ];
    }),
  );
  return { ...theme, name: WARM_DARK_THEME_NAME, style: { ...theme.style, syntax } };
}

// Themes resolve on the main thread and reach the diff workers already resolved.
registerCustomTheme(
  WARM_DARK_THEME_NAME,
  async () => {
    const base = await getResolvedOrResolveTheme("pierre-dark", "highlights");
    if (!base.zed) throw new Error("pierre-dark has no Highlights palette");
    return withWarmSyntax(base.zed);
  },
  "zed",
);
