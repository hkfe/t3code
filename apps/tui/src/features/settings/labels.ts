import {
  type EnvironmentId,
  MAX_THREAD_LABELS,
  THREAD_LABEL_COLORS,
  type ThreadLabel,
  type ThreadLabelColor,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

export type Labels = ReadonlyArray<ThreadLabel>;

export function addLabel(labels: Labels, id: string): Labels {
  if (labels.length >= MAX_THREAD_LABELS) return labels;
  const color = THREAD_LABEL_COLORS[labels.length % THREAD_LABEL_COLORS.length]!;
  return [...labels, { id, name: "new label", color }];
}

/** Blank names keep the old one, as on web. */
export function renameLabel(labels: Labels, index: number, name: string): Labels {
  const trimmed = name.trim().slice(0, 32);
  if (trimmed === "") return labels;
  return labels.map((label, at) => (at === index ? { ...label, name: trimmed } : label));
}

function shiftColor(color: ThreadLabelColor, by: 1 | -1): ThreadLabelColor {
  const count = THREAD_LABEL_COLORS.length;
  return THREAD_LABEL_COLORS[(THREAD_LABEL_COLORS.indexOf(color) + by + count) % count]!;
}

export function recolorLabel(labels: Labels, index: number, by: 1 | -1): Labels {
  return labels.map((label, at) =>
    at === index ? { ...label, color: shiftColor(label.color, by) } : label,
  );
}

export function moveLabel(labels: Labels, index: number, by: 1 | -1): Labels {
  const target = index + by;
  if (index < 0 || index >= labels.length || target < 0 || target >= labels.length) return labels;
  const next = [...labels];
  const [label] = next.splice(index, 1);
  next.splice(target, 0, label!);
  return next;
}

function deleteLabel(labels: Labels, index: number): Labels {
  return labels.filter((_, at) => at !== index);
}

/** How many threads carry each label id. */
export function labelUsage(
  threads: ReadonlyArray<{ readonly tags?: ReadonlyArray<string> | undefined }>,
): ReadonlyMap<string, number> {
  const usage = new Map<string, number>();
  for (const thread of threads) {
    for (const tag of thread.tags ?? []) usage.set(tag, (usage.get(tag) ?? 0) + 1);
  }
  return usage;
}

export type LabelMode =
  | { readonly kind: "list" }
  | { readonly kind: "rename"; readonly value: string }
  | { readonly kind: "delete"; readonly uses: number };

/** Editor state. `draft` is the newest list not yet echoed by the server. */
export interface LabelEditor {
  readonly draft: Labels | null;
  readonly cursor: number;
  readonly mode: LabelMode;
}

export const labelEditorAtom = Atom.family((_environmentId: EnvironmentId) =>
  Atom.make<LabelEditor>({ draft: null, cursor: 0, mode: { kind: "list" } }),
);

export type LabelAction =
  | { readonly type: "cursor"; readonly by: 1 | -1 }
  | { readonly type: "add"; readonly id: string }
  | { readonly type: "recolor"; readonly by: 1 | -1 }
  | { readonly type: "reorder"; readonly by: 1 | -1 }
  | { readonly type: "rename"; readonly value: string }
  | { readonly type: "commitRename" }
  | { readonly type: "askDelete"; readonly uses: number }
  | { readonly type: "confirmDelete" }
  | { readonly type: "cancel" };

/**
 * Every edit builds on the draft, not on `saved`, so a second key pressed before the
 * server echoes the first does not undo it. A changed `draft` is the list to write.
 */
export function reduceLabels(state: LabelEditor, saved: Labels, action: LabelAction): LabelEditor {
  const labels = state.draft ?? saved;
  const cursor = Math.min(state.cursor, Math.max(0, labels.length - 1));
  const edit = (draft: Labels, nextCursor = cursor): LabelEditor => ({
    draft: draft === labels ? state.draft : draft,
    cursor: Math.max(0, Math.min(nextCursor, draft.length - 1)),
    mode: { kind: "list" },
  });
  switch (action.type) {
    case "cursor":
      return { ...state, cursor: Math.max(0, Math.min(cursor + action.by, labels.length - 1)) };
    case "add":
      return edit(addLabel(labels, action.id), labels.length);
    case "recolor":
      return edit(recolorLabel(labels, cursor, action.by));
    case "reorder": {
      const moved = moveLabel(labels, cursor, action.by);
      return edit(moved, moved === labels ? cursor : cursor + action.by);
    }
    case "rename":
      return { ...state, cursor, mode: { kind: "rename", value: action.value.slice(0, 32) } };
    case "commitRename":
      return state.mode.kind === "rename"
        ? edit(renameLabel(labels, cursor, state.mode.value))
        : state;
    case "askDelete":
      return { ...state, cursor, mode: { kind: "delete", uses: action.uses } };
    case "confirmDelete":
      return state.mode.kind === "delete" ? edit(deleteLabel(labels, cursor)) : state;
    case "cancel":
      return { ...state, mode: { kind: "list" } };
  }
}
