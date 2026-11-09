import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { PullRequestCheck, PullRequestCheckLog } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { useContext, useMemo, useState } from "react";

import type { PrPanelTabProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { pullRequestAtoms } from "../../state/pullRequests.ts";
import { theme } from "../../theme/theme.ts";
import { span, truncate, wrapHard, type Line } from "../thread-view/lines.ts";
import { parseAnsiLog } from "./ansi.ts";
import {
  checkDuration,
  checkStatusLabel,
  checksState,
  groupChecks,
  summarizeChecks,
} from "./model.ts";
import { CHECKS_TONE } from "./SummaryTab.tsx";
import { LinesView, StatusLine, resultState, usePullRequestDetail, useScroll } from "./view.tsx";

const STATUS: Record<
  PullRequestCheck["status"],
  { readonly glyph: string; readonly color: string }
> = {
  pending: { glyph: "●", color: theme.warning },
  "action-required": { glyph: "◉", color: theme.warning },
  success: { glyph: "✓", color: theme.success },
  failure: { glyph: "✗", color: theme.danger },
  cancelled: { glyph: "✗", color: theme.danger },
  skipped: { glyph: "⊘", color: theme.textFaint },
  neutral: { glyph: "◌", color: theme.textFaint },
};

const noLog = Atom.make(AsyncResult.initial<PullRequestCheckLog>());

type LogState =
  | { readonly kind: "no-url" }
  | { readonly kind: "loading" }
  | { readonly kind: "error" }
  | { readonly kind: "host-only"; readonly host: string }
  | { readonly kind: "loaded"; readonly log: NonNullable<PullRequestCheckLog> };

function hostName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "the check's host";
  }
}

const LOG_HEADER: Record<LogState["kind"], (state: LogState) => string> = {
  "no-url": () => "The host reported no log for this check.",
  loading: () => "Loading log…",
  error: () =>
    "Could not load the log. It may have expired, or this account cannot read it. r retries.",
  "host-only": (state) =>
    `Logs are only available on ${state.kind === "host-only" ? state.host : ""}.`,
  loaded: (state) =>
    state.kind === "loaded"
      ? `${state.log.failedStep ? "Failing step" : "End of log"}${state.log.truncated ? " (trimmed)" : ""} · r refreshes`
      : "",
};

// Logs run to thousands of lines; parse each answer once, not on every key press.
const parsedLogs = new WeakMap<object, Line[]>();
function parsedLog(log: NonNullable<PullRequestCheckLog>): Line[] {
  const cached = parsedLogs.get(log) ?? parseAnsiLog(log.text);
  parsedLogs.set(log, cached);
  return cached;
}

/** Every log state renders in the same frame: one header line, then the body. */
function logLines(state: LogState, width: number): Line[] {
  const inner = Math.max(8, width - 4);
  const frame = (line: Line): Line => [span("  │ ", { color: theme.border }), ...line];
  const body =
    state.kind !== "loaded"
      ? []
      : state.log.text.length === 0
        ? [[span("The log is empty.", { color: theme.textMuted })]]
        : parsedLog(state.log).flatMap((line) =>
            line.length === 0 ? [[]] : wrapHard(line, inner),
          );
  return [
    [
      span("  ╭ ", { color: theme.border }),
      span(truncate(LOG_HEADER[state.kind](state), inner), { color: theme.textMuted }),
    ],
    ...body.map(frame),
    [span("  ╰", { color: theme.border })],
  ];
}

function checkSections(checks: ReadonlyArray<PullRequestCheck>) {
  const { attention, running, completed } = groupChecks(checks);
  return [
    { label: "Needs attention", checks: attention },
    { label: "Running", checks: running },
    { label: "Completed", checks: completed },
  ].filter((section) => section.checks.length > 0);
}

/** Lines of the tab and the line of each check, for scrolling the selection into view. */
function checksLines(
  checks: ReadonlyArray<PullRequestCheck>,
  selected: number,
  open: { readonly index: number; readonly state: LogState } | null,
  width: number,
) {
  const lines: Line[] = [];
  const rows: number[] = [];
  const state = checksState(checks);
  lines.push([
    ...(state ? [span(`${CHECKS_TONE[state].glyph} `, { color: CHECKS_TONE[state].color })] : []),
    span(summarizeChecks(checks), { color: theme.text, bold: true }),
  ]);
  let index = 0;
  for (const section of checkSections(checks)) {
    lines.push(
      [],
      [
        span(section.label, { color: theme.accent, bold: true }),
        span(` ${section.checks.length}`, { color: theme.textFaint }),
      ],
    );
    for (const check of section.checks) {
      const status = STATUS[check.status];
      const tail = ` ${[checkDuration(check), checkStatusLabel(check)].filter(Boolean).join(" · ")}`;
      const isSelected = index === selected;
      rows.push(lines.length);
      lines.push([
        span(isSelected ? "▌" : " ", { color: theme.accent }),
        span(`${open?.index === index ? "▾" : "▸"} `, { color: theme.textFaint }),
        span(`${status.glyph} `, { color: status.color }),
        span(truncate(check.name, Math.max(4, width - 5 - tail.length)), {
          color: theme.text,
          bold: isSelected,
        }),
        span(tail, { color: theme.textMuted }),
      ]);
      if (open?.index === index) lines.push(...logLines(open.state, width));
      index++;
    }
  }
  return { lines, rows };
}

function logState(
  check: PullRequestCheck,
  result: AsyncResult.AsyncResult<PullRequestCheckLog, unknown>,
): LogState {
  if (!check.url) return { kind: "no-url" };
  const { value, failed, loading } = resultState(result);
  if (value) return { kind: "loaded", log: value };
  if (failed) return { kind: "error" };
  if (loading) return { kind: "loading" };
  return { kind: "host-only", host: hostName(check.url) };
}

export function ChecksTab({ target, width, height }: PrPanelTabProps) {
  const registry = useContext(RegistryContext);
  const detail = usePullRequestDetail(target);
  const checks = useMemo(
    () => checkSections(detail.value?.checks ?? []).flatMap((section) => section.checks),
    [detail.value],
  );
  const [selected, setSelected] = useState(0);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const openCheck = openIndex === null ? undefined : checks[openIndex];
  const logAtom = openCheck?.url
    ? pullRequestAtoms.checkLog({
        environmentId: target.environmentId,
        input: { ...target.reference, url: openCheck.url },
      })
    : noLog;
  const logResult = useAtomValue(logAtom);
  const open =
    openCheck && openIndex !== null
      ? { index: openIndex, state: logState(openCheck, logResult) }
      : null;
  const { lines, rows } = checksLines(detail.value?.checks ?? [], selected, open, width);
  const { top, scrollTo, scrollKey } = useScroll(lines.length, height);

  const select = (next: number) => {
    const index = Math.max(0, Math.min(next, checks.length - 1));
    setSelected(index);
    const line = rows[index] ?? 0;
    if (line < top) scrollTo(line);
    else if (line >= top + height) scrollTo(line - height + 1);
  };

  useRegionInput("panel", (press) => {
    if (isKey(press, "arrowdown") || press.input === "j") select(selected + 1);
    else if (isKey(press, "arrowup") || press.input === "k") select(selected - 1);
    else if ((isKey(press, "enter") || press.input === " ") && checks.length > 0)
      setOpenIndex(openIndex === selected ? null : selected);
    else if (isKey(press, "escape") && openIndex !== null) setOpenIndex(null);
    else if (press.input === "r" && openCheck?.url) registry.refresh(logAtom);
    else return scrollKey(press);
    return true;
  });

  if (detail.value === null)
    return (
      <StatusLine
        text={detail.failed ? "Could not load the checks. r retries." : "Loading checks…"}
      />
    );
  return <LinesView lines={lines} top={top} height={height} />;
}
