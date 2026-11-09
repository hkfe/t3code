import type { KeyContext } from "./feature.ts";
import { displayKey, keyId, leaderKeyOf } from "./keys.ts";
import type { ShellRegistry } from "./registry.ts";

type Shell = Pick<ShellRegistry, "keybindings" | "commands" | "leaderKey">;

export type HelpRow =
  | { readonly kind: "group"; readonly title: string }
  | {
      readonly kind: "binding";
      readonly key: string;
      readonly title: string;
      readonly feature: string;
      readonly custom: boolean;
      readonly leader: boolean;
    };

/** Every binding matching `query`: the leader map first, then direct keys by feature. */
export function helpRows(shell: Shell, query: string): ReadonlyArray<HelpRow> {
  const needle = query.trim().toLowerCase();
  const rows = shell.keybindings
    .map((binding) => ({
      kind: "binding" as const,
      key: displayKey(binding.key, shell.leaderKey),
      title: shell.commands.get(binding.command)?.title ?? binding.command,
      command: binding.command,
      feature: binding.feature,
      custom: binding.custom === true,
      leader: leaderKeyOf(binding.key) !== null,
    }))
    .filter((row) =>
      [row.key, row.title, row.command, row.feature].some((text) =>
        text.toLowerCase().includes(needle),
      ),
    );
  const features = [...new Set(rows.map((row) => row.feature))];
  const groups = [
    {
      title: `Leader map: ${displayKey(shell.leaderKey ?? "unbound leader", null)}, then a key`,
      rows: rows.filter((row) => row.leader),
    },
    ...features.map((feature) => ({
      title: feature,
      rows: rows.filter((row) => !row.leader && row.feature === feature),
    })),
  ];
  return groups.flatMap((group) =>
    group.rows.length === 0 ? [] : [{ kind: "group" as const, title: group.title }, ...group.rows],
  );
}

/** Leader bindings usable in `context`, by feature; the first of a key wins, as in the router. */
export function leaderGroups(
  shell: Shell,
  context: KeyContext,
): ReadonlyArray<{
  readonly feature: string;
  readonly entries: ReadonlyArray<{ readonly key: string; readonly title: string }>;
}> {
  const seen = new Set<string | null>();
  const groups = new Map<string, Array<{ readonly key: string; readonly title: string }>>();
  for (const binding of shell.keybindings) {
    const key = leaderKeyOf(binding.key);
    if (key === null || seen.has(keyId(binding.key)) || !(binding.when?.(context) ?? true)) {
      continue;
    }
    seen.add(keyId(binding.key));
    const title = shell.commands.get(binding.command)?.title ?? binding.command;
    groups.set(binding.feature, [...(groups.get(binding.feature) ?? []), { key, title }]);
  }
  return [...groups].map(([feature, entries]) => ({ feature, entries }));
}
