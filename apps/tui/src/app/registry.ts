import { createContext, useContext } from "react";

import type {
  PaletteSource,
  TuiCommand,
  TuiFeature,
  TuiKeybinding,
  TuiStatusItem,
  TuiView,
  TuiViewFooter,
} from "./feature.ts";

export interface ShellRegistry {
  readonly commands: ReadonlyMap<string, TuiCommand>;
  readonly keybindings: ReadonlyArray<TuiKeybinding>;
  readonly sidebar: TuiView["component"] | null;
  readonly views: ReadonlyMap<string, TuiView>;
  readonly footers: ReadonlyArray<TuiViewFooter>;
  readonly panels: ReadonlyMap<string, TuiView & { readonly title: string }>;
  readonly overlays: ReadonlyMap<string, TuiView>;
  readonly statusItems: ReadonlyArray<TuiStatusItem>;
  readonly paletteSources: ReadonlyArray<PaletteSource>;
}

function indexById<T extends { readonly id: string }>(kind: string, items: ReadonlyArray<T>) {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`Duplicate TUI ${kind} id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

/** Merges features in order. Duplicate ids and unknown command ids throw at startup. */
export function buildShellRegistry(features: ReadonlyArray<TuiFeature>): ShellRegistry {
  indexById("feature", features);
  const commands = indexById(
    "command",
    features.flatMap((feature) => feature.commands ?? []),
  );
  const keybindings = features.flatMap((feature) => feature.keybindings ?? []);
  for (const binding of keybindings) {
    if (!commands.has(binding.command)) {
      throw new Error(`TUI keybinding ${binding.key} names unknown command ${binding.command}`);
    }
  }
  const sidebars = features.flatMap((feature) => (feature.sidebar ? [feature.sidebar] : []));
  if (sidebars.length > 1) throw new Error("Only one TUI feature may provide the sidebar.");
  return {
    commands,
    keybindings,
    sidebar: sidebars[0] ?? null,
    views: indexById(
      "view",
      features.flatMap((feature) => feature.views ?? []),
    ),
    footers: [
      ...indexById(
        "footer",
        features.flatMap((feature) => feature.footers ?? []),
      ).values(),
    ],
    panels: indexById(
      "panel",
      features.flatMap((feature) => feature.panels ?? []),
    ),
    overlays: indexById(
      "overlay",
      features.flatMap((feature) => feature.overlays ?? []),
    ),
    statusItems: [
      ...indexById(
        "status item",
        features.flatMap((feature) => feature.statusItems ?? []),
      ).values(),
    ],
    paletteSources: [
      ...indexById(
        "palette source",
        features.flatMap((feature) => feature.paletteSources ?? []),
      ).values(),
    ],
  };
}

export const ShellRegistryContext = createContext<ShellRegistry | null>(null);

export function useShellRegistry(): ShellRegistry {
  const registry = useContext(ShellRegistryContext);
  if (registry === null) throw new Error("useShellRegistry needs <ShellRegistryContext>.");
  return registry;
}
