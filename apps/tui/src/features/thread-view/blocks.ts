import {
  isOrchestrationV2WorkActive,
  type OrchestrationV2ProjectedTurnItem,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import { commandDisplayText } from "@t3tools/client-runtime/work-log/command-label";
import {
  contextCompactionLabel,
  resolveWorkEntryToolPresentation,
  summarizeToolGroup,
  workEntryDisplayIndicatesToolFailure,
  type WorkLogPresentationEntry,
} from "@t3tools/client-runtime/work-log/presentation";
import { extractToolActivityPresentation } from "@t3tools/client-runtime/work-log/tool-presentation";
import * as DateTime from "effect/DateTime";

import { theme } from "../../theme/theme.ts";
import { span, truncate, wrap, type Line } from "./lines.ts";
import { parseMarkdown, renderMarkdown, type MarkdownTree } from "./markdown.ts";

type Item = OrchestrationV2TurnItem;
type Of<T extends Item["type"]> = Extract<Item, { type: T }>;

/** One visual unit of the thread. `id` is stable while the block streams or grows. */
export type Block =
  | { readonly kind: "user"; readonly id: string; readonly items: readonly [Of<"user_message">] }
  | {
      readonly kind: "assistant";
      readonly id: string;
      readonly items: readonly [Of<"assistant_message">];
    }
  | { readonly kind: "work"; readonly id: string; readonly items: ReadonlyArray<Item> }
  | { readonly kind: "single"; readonly id: string; readonly items: readonly [Item] };

const WORK_TYPES = new Set<Item["type"]>([
  "reasoning",
  "command_execution",
  "file_change",
  "file_search",
  "web_search",
  "dynamic_tool",
  "subagent",
  "approval_request",
]);

export function buildBlocks(rows: ReadonlyArray<OrchestrationV2ProjectedTurnItem>): Block[] {
  const blocks: Block[] = [];
  for (const { item } of rows) {
    const last = blocks.at(-1);
    if (item.type === "user_message") blocks.push({ kind: "user", id: item.id, items: [item] });
    else if (item.type === "assistant_message")
      blocks.push({ kind: "assistant", id: item.id, items: [item] });
    else if (WORK_TYPES.has(item.type)) {
      if (last?.kind === "work")
        blocks[blocks.length - 1] = { ...last, items: [...last.items, item] };
      else blocks.push({ kind: "work", id: item.id, items: [item] });
    } else blocks.push({ kind: "single", id: item.id, items: [item] });
  }
  return blocks;
}

/** Blocks that can be expanded with enter. */
export function isExpandable(block: Block): boolean {
  return block.kind === "work";
}

/** The message id a later "reply to this message" action quotes, if the block is a message. */
export function blockMessageId(block: Block): string | null {
  const [item] = block.items;
  return item.type === "user_message" || item.type === "assistant_message" ? item.messageId : null;
}

function lifecycle(item: Item): NonNullable<WorkLogPresentationEntry["toolLifecycleStatus"]> {
  switch (item.status) {
    case "pending":
    case "running":
    case "waiting":
      return "inProgress";
    case "cancelled":
    case "interrupted":
      return "stopped";
    default:
      return item.status;
  }
}

// Entries are reused while their item is unchanged; summarizeToolGroup caches checks per entry.
const entries = new WeakMap<Item, WorkLogPresentationEntry>();

function workEntry(item: Item): WorkLogPresentationEntry {
  const cached = entries.get(item);
  if (cached) return cached;
  const title = item.title?.trim() || undefined;
  const entry: WorkLogPresentationEntry = {
    ...extractToolActivityPresentation(item),
    id: item.id,
    createdAt: DateTime.formatIso(item.startedAt ?? item.updatedAt),
    label: title ?? item.type.replaceAll("_", " "),
    tone:
      item.type === "reasoning" ? "thinking" : item.type === "approval_request" ? "info" : "tool",
    itemType: item.type,
    toolLifecycleStatus: lifecycle(item),
    structuredPayload: item,
    toolData: item,
    ...(title ? { toolTitle: title } : {}),
    ...(item.type === "reasoning" && item.text ? { detail: item.text } : {}),
    ...(item.type === "command_execution" ? { command: item.input, rawCommand: item.input } : {}),
    ...(item.type === "file_change"
      ? { changedFiles: item.changes?.map((change) => change.path) ?? [item.fileName] }
      : {}),
    ...(item.type === "file_search" && item.pattern ? { detail: item.pattern } : {}),
    ...(item.type === "web_search" && item.patterns?.length
      ? { detail: item.patterns.join(", ") }
      : {}),
    ...(item.type === "approval_request"
      ? { requestKind: item.requestKind, ...(item.prompt ? { detail: item.prompt } : {}) }
      : {}),
    ...(item.type === "dynamic_tool"
      ? {
          toolTitle: title ?? item.toolName ?? "Tool",
          toolData: { input: item.input, output: item.output },
        }
      : {}),
  };
  entries.set(item, entry);
  return entry;
}

export function workSummary(items: ReadonlyArray<Item>) {
  return summarizeToolGroup(items.map(workEntry));
}

/** The argument that best names a tool call: its path, pattern, command or url. */
function toolArgument(input: unknown): string {
  if (input === null || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  const value = ["file_path", "path", "pattern", "command", "url", "query"]
    .map((key) => record[key])
    .find((candidate) => typeof candidate === "string");
  return typeof value === "string" ? value : "";
}

function entryLabel(item: Item): string {
  switch (item.type) {
    case "command_execution":
      return `$ ${commandDisplayText(item.input)}`;
    case "file_change": {
      const counts = [
        item.additions !== undefined ? `+${item.additions}` : "",
        item.deletions !== undefined ? `-${item.deletions}` : "",
      ].join(" ");
      return `Edited ${item.fileName} ${counts}`.trim();
    }
    case "file_search":
      return `Searched ${item.pattern ?? "files"}`;
    case "web_search":
      return `Searched the web${item.patterns?.length ? `: ${item.patterns.join(", ")}` : ""}`;
    case "reasoning":
      return isOrchestrationV2WorkActive(item.status) ? "Thinking" : "Thought";
    case "subagent":
      return `Agent: ${item.title ?? item.prompt}`;
    case "approval_request":
      return `Approval: ${item.prompt ?? item.requestKind}`;
    default: {
      const name =
        resolveWorkEntryToolPresentation(workEntry(item))?.displayName ??
        item.title ??
        (item.type === "dynamic_tool" ? (item.toolName ?? "Tool") : item.type);
      return item.type === "dynamic_tool" ? `${name} ${toolArgument(item.input)}`.trim() : name;
    }
  }
}

function statusMark(item: Item) {
  if (isOrchestrationV2WorkActive(item.status)) return span("○ ", { color: theme.info });
  if (item.status === "failed" || workEntryDisplayIndicatesToolFailure(workEntry(item)))
    return span("✗ ", { color: theme.danger });
  if (item.status === "cancelled" || item.status === "interrupted")
    return span("■ ", { color: theme.textFaint });
  return span("✓ ", { color: theme.success });
}

/** One-line text for items that are not messages, work, plans or errors. */
function noticeText(item: Item): string {
  switch (item.type) {
    case "notification":
      return item.summary;
    case "system_notice":
    case "run_interrupt_request":
    case "run_interrupt_result":
      return item.message;
    case "compaction":
      return contextCompactionLabel(item);
    case "checkpoint":
      return `Checkpoint: ${item.filesTotal?.count ?? item.files.length} files changed`;
    case "handoff":
      return `Handed off to ${item.toModel ?? item.toProviderInstanceId}`;
    case "fork":
      return "Forked thread";
    case "thread_created":
      return `Created thread with ${item.targetModel}`;
    case "user_input_request":
      return `Asked: ${item.questions.map((question) => question.header).join(", ")}`;
    case "secret_request":
      return `Requested secret: ${item.label}`;
    case "link_request":
      return `Requested link${item.url ? `: ${item.url}` : ""}`;
    default:
      return item.title ?? item.type.replaceAll("_", " ");
  }
}

function formatTime(item: Item): string {
  const date = DateTime.toDate(item.startedAt ?? item.updatedAt);
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === new Date().toDateString()
    ? time
    : `${date.toLocaleDateString([], { month: "short", day: "numeric" })} ${time}`;
}

const trees = new WeakMap<object, { readonly text: string; readonly tree: MarkdownTree }>();

/** Parses once per text: streaming items are new objects, so key on the item and check text. */
function markdown(key: object, text: string, width: number, color?: string): Line[] {
  let cached = trees.get(key);
  if (cached?.text !== text) {
    cached = { text, tree: parseMarkdown(text) };
    trees.set(key, cached);
  }
  return renderMarkdown(cached.tree, width, color ? { color } : {});
}

const label = (text: string, color: string) => [span(text, { color, bold: true })];

function renderWork(items: ReadonlyArray<Item>, width: number, expanded: boolean): Line[] {
  const { summary, hasFailure } = workSummary(items);
  const active = items.some((item) => isOrchestrationV2WorkActive(item.status));
  const head: Line = [
    span(expanded ? "▾ " : "▸ ", { color: theme.textFaint }),
    ...(active ? [span("Working · ", { color: theme.info })] : []),
    span(truncate(summary, width - 12), { color: theme.textMuted }),
    ...(hasFailure ? [span("  ✗ failed", { color: theme.danger })] : []),
  ];
  if (!expanded) return [head];
  return [
    head,
    ...items.flatMap((item) => {
      const row: Line = [
        span("  "),
        statusMark(item),
        span(truncate(entryLabel(item), width - 4), { color: theme.textMuted }),
      ];
      if (item.type !== "reasoning" || !item.text) return [row];
      return [
        row,
        ...markdown(item, item.text, width - 4, theme.textFaint).map((line) => [
          span("    "),
          ...line,
        ]),
      ];
    }),
  ];
}

function renderSingle(item: Item, width: number): Line[] {
  switch (item.type) {
    case "proposed_plan":
      return [
        label(item.streaming ? "Plan …" : "Plan", theme.accent),
        ...markdown(item, item.markdown, width - 2).map((line) => [
          span("│ ", { color: theme.border }),
          ...line,
        ]),
      ];
    case "todo_list": {
      const done = item.steps.filter((step) => step.status === "completed").length;
      return [
        label(`Todo ${done}/${item.steps.length}`, theme.accent),
        ...(item.explanation
          ? wrap([span(item.explanation, { color: theme.textMuted })], width)
          : []),
        ...item.steps.flatMap((step) =>
          wrap(
            [
              span(step.text, {
                color: step.status === "completed" ? theme.textFaint : theme.text,
                strikethrough: step.status === "completed",
              }),
            ],
            width,
            [
              span(
                step.status === "completed" ? "[x] " : step.status === "running" ? "[>] " : "[ ] ",
                { color: step.status === "running" ? theme.info : theme.textMuted },
              ),
            ],
            [span("    ")],
          ),
        ),
      ];
    }
    case "error": {
      const retry = item.retry
        ? ` (retry ${item.retry.attempt}${item.retry.maxAttempts ? `/${item.retry.maxAttempts}` : ""})`
        : "";
      return wrap(
        [span(`${item.failure.message}${retry}`, { color: theme.danger })],
        width,
        [span("✗ ", { color: theme.danger, bold: true })],
        [span("  ")],
      );
    }
    default:
      return wrap([span(noticeText(item), { color: theme.textFaint })], width, [
        span("· ", { color: theme.textFaint }),
      ]);
  }
}

/** Lines for one block at `width` cells, without the selection gutter. */
export function renderBlock(block: Block, width: number, expanded: boolean): Line[] {
  switch (block.kind) {
    case "user": {
      const [item] = block.items;
      const time = formatTime(item);
      const rule = Math.max(0, width - time.length - 4);
      return [
        [
          span(`── ${time} `, { color: theme.textFaint }),
          span("─".repeat(rule), { color: theme.border }),
        ],
        label("you", theme.accent),
        ...wrap([span(item.text, { color: theme.text })], width),
        ...(item.attachments.length > 0
          ? [
              [
                span(
                  `[${item.attachments.length} ${item.attachments.length === 1 ? "attachment" : "attachments"}]`,
                  { color: theme.textMuted },
                ),
              ],
            ]
          : []),
      ];
    }
    case "assistant": {
      const [item] = block.items;
      const body = item.text.trim() === "" ? [] : markdown(item, item.text, width);
      return item.streaming ? [...body, [span("▍", { color: theme.accent })]] : body;
    }
    case "work":
      return renderWork(block.items, width, expanded);
    case "single":
      return renderSingle(block.items[0], width);
  }
}
