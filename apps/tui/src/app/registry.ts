import type { AtomRegistry } from "effect/reactivity";
import { createContext, useContext } from "react";

import type { Region } from "../state/ui.ts";

import type {
  PaletteSource,
  TuiCommand,
  TuiFeature,
  TuiKeybinding,
  TuiPrPanelTab,
  TuiStatusItem,
  TuiView,
  TuiViewFooter,
} from "./feature.ts";
import { keyId } from "./keys.ts";

export interface RegisteredKeybinding extends TuiKeybinding {
  /** Id of the feature that owns the command, for grouping in help. */
  readonly feature: string;
  /** Set when the binding comes from the user's keybindings.json. */
  readonly custom?: true;
}

/** The decoded user keybindings file: web rules, without `when`. */
export interface UserKeybindings {
  readonly rules: ReadonlyArray<{
    readonly key: string;
    readonly command: string;
    readonly when?: string | undefined;
  }>;
  /** Problems found while reading the file, such as invalid JSON. */
  readonly errors: ReadonlyArray<string>;
}

export const LEADER_COMMAND = "core.leader";

export interface ShellRegistry {
  readonly commands: ReadonlyMap<string, TuiCommand>;
  /** User bindings first, so they win ties, then feature defaults in feature order. */
  readonly keybindings: ReadonlyArray<RegisteredKeybinding>;
  /** First key of the leader command, or null when the user unbound it. */
  readonly leaderKey: string | null;
  /** Rules of keybindings.json that were skipped, with the reason. */
  readonly keybindingErrors: ReadonlyArray<string>;
  readonly sidebar: TuiView["component"] | null;
  readonly views: ReadonlyMap<string, TuiView>;
  readonly footers: ReadonlyArray<TuiViewFooter>;
  readonly panels: ReadonlyMap<string, TuiView & { readonly title: string }>;
  readonly overlays: ReadonlyMap<string, TuiView>;
  readonly statusItems: ReadonlyArray<TuiStatusItem>;
  readonly paletteSources: ReadonlyArray<PaletteSource>;
  readonly prPanelTabs: ReadonlyArray<TuiPrPanelTab>;
}

function indexById<T extends { readonly id: string }>(kind: string, items: ReadonlyArray<T>) {
  const map = new Map<string, T>();
  for (const item of items) {
    if (map.has(item.id)) throw new Error(`Duplicate TUI ${kind} id: ${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

const noOverlay = ({ overlay }: { readonly overlay: string | null }) => overlay === null;

/**
 * As on web, a user rule replaces every default binding of its command. It keeps the `when` of
 * the command's first default, else applies while no overlay is open.
 */
function applyUserKeybindings(
  defaults: ReadonlyArray<RegisteredKeybinding>,
  owners: ReadonlyMap<string, string>,
  user: UserKeybindings | undefined,
) {
  const errors = [...(user?.errors ?? [])];
  const rules = (user?.rules ?? []).filter((rule, index) => {
    const where = `keybindings.json rule ${index + 1}`;
    const error =
      rule.when !== undefined
        ? `${where}: "when" is not supported in the TUI`
        : !owners.has(rule.command)
          ? `${where}: unknown command ${rule.command}`
          : keyId(rule.key) === null
            ? `${where}: invalid key ${rule.key}`
            : null;
    if (error !== null) errors.push(error);
    return error === null;
  });
  const replaced = new Set(rules.map((rule) => rule.command));
  const custom = rules.map((rule): RegisteredKeybinding => ({
    key: rule.key,
    command: rule.command,
    when: defaults.find((binding) => binding.command === rule.command)?.when ?? noOverlay,
    feature: owners.get(rule.command) ?? "user",
    custom: true,
  }));
  return {
    keybindings: [...custom, ...defaults.filter((binding) => !replaced.has(binding.command))],
    errors,
  };
}

/** Merges features in order. Duplicate ids, unknown command ids and bad keys throw at startup. */
export function buildShellRegistry(
  features: ReadonlyArray<TuiFeature>,
  user?: UserKeybindings,
): ShellRegistry {
  indexById("feature", features);
  const commands = indexById(
    "command",
    features.flatMap((feature) => feature.commands ?? []),
  );
  const owners = new Map(
    features.flatMap((feature) =>
      (feature.commands ?? []).map((command) => [command.id, feature.id] as const),
    ),
  );
  const defaults = features.flatMap((feature) =>
    (feature.keybindings ?? []).map((binding) => ({ ...binding, feature: feature.id })),
  );
  for (const binding of defaults) {
    if (!commands.has(binding.command)) {
      throw new Error(`TUI keybinding ${binding.key} names unknown command ${binding.command}`);
    }
    if (keyId(binding.key) === null) throw new Error(`Invalid TUI keybinding: ${binding.key}`);
  }
  const { keybindings, errors } = applyUserKeybindings(defaults, owners, user);
  const sidebars = features.flatMap((feature) => (feature.sidebar ? [feature.sidebar] : []));
  if (sidebars.length > 1) throw new Error("Only one TUI feature may provide the sidebar.");
  return {
    commands,
    keybindings,
    leaderKey: keybindings.find((binding) => binding.command === LEADER_COMMAND)?.key ?? null,
    keybindingErrors: errors,
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
    prPanelTabs: [
      ...indexById(
        "PR panel tab",
        features.flatMap((feature) => feature.prPanelTabs ?? []),
      ).values(),
    ].toSorted((left, right) => left.order - right.order),
  };
}

const REGIONS: ReadonlyArray<Region> = ["sidebar", "main", "panel"];

/**
 * Pairs of bindings with one key and different commands whose `when` both pass in some focus and
 * overlay. The first one wins, so the second never runs there. `when`s that read atoms are judged
 * on `registry`'s current state.
 */
export function keyCollisions(
  shell: Pick<ShellRegistry, "keybindings" | "overlays">,
  registry: AtomRegistry.AtomRegistry,
): ReadonlyArray<string> {
  const contexts = REGIONS.flatMap((focus) =>
    [null, ...shell.overlays.keys()].map((overlay) => ({ focus, overlay, registry })),
  );
  return shell.keybindings.flatMap((first, index) =>
    shell.keybindings
      .slice(index + 1)
      .filter(
        (second) =>
          second.command !== first.command &&
          keyId(second.key) === keyId(first.key) &&
          contexts.some(
            (context) => (first.when?.(context) ?? true) && (second.when?.(context) ?? true),
          ),
      )
      .map((second) => `${first.key}: ${first.command} hides ${second.command}`),
  );
}

export const ShellRegistryContext = createContext<ShellRegistry | null>(null);

export function useShellRegistry(): ShellRegistry {
  const registry = useContext(ShellRegistryContext);
  if (registry === null) throw new Error("useShellRegistry needs <ShellRegistryContext>.");
  return registry;
}
