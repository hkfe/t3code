import { useAtomValue } from "@effect/atom-react";
import { useMemo, useState } from "react";

import type { PrPanelTabProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { pullRequestAtoms } from "../../state/pullRequests.ts";
import { theme } from "../../theme/theme.ts";
import { span, wrap, type Line, type Span } from "../thread-view/lines.ts";
import {
  buildTimeline,
  buildTimelineRows,
  timelineDayLabel,
  type TimelineEvent,
  type TimelineRow,
} from "./model.ts";
import {
  LinesView,
  renderPullRequestMarkdown,
  StatusLine,
  resultState,
  usePullRequestDetail,
  useScroll,
} from "./view.tsx";

const BODY_LINES = 8;
const RAIL = 3;

const MARKER: Record<TimelineEvent["kind"], { readonly glyph: string; readonly color: string }> = {
  opened: { glyph: "◆", color: theme.success },
  commit: { glyph: "○", color: theme.textMuted },
  comment: { glyph: "●", color: theme.info },
  review: { glyph: "●", color: theme.info },
  thread: { glyph: "◇", color: theme.info },
  merged: { glyph: "◆", color: theme.syntax.typesComponents },
  closed: { glyph: "◆", color: theme.danger },
};

const OUTCOME = {
  approved: { title: "approved", glyph: "✓", color: theme.success },
  "changes-requested": { title: "requested changes", glyph: "✗", color: theme.danger },
  dismissed: { title: "review dismissed", glyph: "–", color: theme.textMuted },
} as const;

/** A line of the timeline; `marker` puts a glyph on the rail. */
interface RailLine {
  readonly marker: { readonly glyph: string; readonly color: string } | null;
  readonly content: Line;
}

const time = (at: string) =>
  new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
const muted = (text: string) => span(text, { color: theme.textMuted });
const actor = (login: string | null) => span(login ?? "someone", { color: theme.text, bold: true });

function eventHead(event: TimelineEvent): Span[] {
  const outcome = event.outcome ? OUTCOME[event.outcome] : null;
  switch (event.kind) {
    case "opened":
      return [actor(event.actor), muted(" opened this pull request")];
    case "commit":
      return [
        span(event.commit?.oid.slice(0, 7) ?? "", { color: theme.syntax.constants }),
        span(` ${event.body ?? ""}`),
        ...(event.commit?.additions !== undefined
          ? [span(` +${event.commit.additions}`, { color: theme.success })]
          : []),
        ...(event.commit?.deletions !== undefined
          ? [span(` −${event.commit.deletions}`, { color: theme.danger })]
          : []),
      ];
    case "review":
      return outcome
        ? [actor(event.actor), span(` ${outcome.glyph} ${outcome.title}`, { color: outcome.color })]
        : [actor(event.actor), muted(" reviewed")];
    case "comment":
      return [actor(event.actor), muted(" commented")];
    case "thread":
      return [
        actor(event.actor),
        muted(" on "),
        span(event.path ?? "", { color: theme.syntax.functions }),
        ...(event.replies
          ? [muted(` · ${event.replies} repl${event.replies === 1 ? "y" : "ies"}`)]
          : []),
      ];
    case "merged":
      return [span("Pull request merged", { color: theme.syntax.typesComponents, bold: true })];
    case "closed":
      return [span("Pull request closed", { color: theme.danger, bold: true })];
  }
}

function eventLines(event: TimelineEvent, width: number): RailLine[] {
  const marker =
    event.kind === "review" && event.outcome
      ? { ...MARKER.review, color: OUTCOME[event.outcome].color }
      : MARKER[event.kind];
  const [first = [], ...rest] = wrap(
    [...eventHead(event), span(`  ${time(event.at)}`, { color: theme.textFaint })],
    width,
  );
  const body =
    event.body === null || event.kind === "commit"
      ? []
      : renderPullRequestMarkdown(event.body, width - 2);
  const shown = body.slice(0, BODY_LINES).map((line) => [span("  "), ...line]);
  const more = body.length - shown.length;
  return [
    { marker, content: first },
    ...[...rest, ...shown, ...(more > 0 ? [[muted(`  … ${more} more lines`)]] : [])].map(
      (content) => ({
        marker: null,
        content,
      }),
    ),
  ];
}

function rowLines(row: TimelineRow, width: number): RailLine[] {
  switch (row.kind) {
    case "day":
      return [
        {
          marker: null,
          content: [span(timelineDayLabel(row.at), { color: theme.accent, bold: true })],
        },
      ];
    case "event":
      return eventLines(row.event, width);
    case "commits":
      return [
        {
          marker: MARKER.commit,
          content: [
            muted(`${row.events.length} commits`),
            span("  e expands", { color: theme.textFaint }),
          ],
        },
      ];
    case "sync":
      return [
        {
          marker: { glyph: "○", color: theme.textFaint },
          content: [
            span(
              `Merged ${row.source} into the branch${row.events.length > 1 ? ` ×${row.events.length}` : ""}`,
              {
                color: theme.textFaint,
              },
            ),
          ],
        },
      ];
  }
}

/** The rail runs from the first marker down to the last one and stops there. */
export function timelineLines(rows: ReadonlyArray<TimelineRow>, width: number): Line[] {
  const all = rows.flatMap((row) => rowLines(row, width - RAIL));
  const first = all.findIndex((line) => line.marker !== null);
  const last = all.findLastIndex((line) => line.marker !== null);
  return all.map((line, index) => {
    const rail = line.marker
      ? span(`${line.marker.glyph}  `, { color: line.marker.color })
      : span(index > first && index < last ? "│  " : "   ", { color: theme.border });
    return [rail, ...line.content];
  });
}

export function TimelineTab({ target, width, height }: PrPanelTabProps) {
  const detail = usePullRequestDetail(target);
  const activity = resultState(
    useAtomValue(
      pullRequestAtoms.activity({ environmentId: target.environmentId, input: target.reference }),
    ),
  );
  const [expanded, setExpanded] = useState(false);
  const lines = useMemo(
    () =>
      detail.value === null
        ? []
        : timelineLines(
            buildTimelineRows(buildTimeline(detail.value, activity.value), expanded),
            width,
          ),
    [detail.value, activity.value, expanded, width],
  );
  const { top, scrollKey } = useScroll(lines.length, height - 1);
  useRegionInput("panel", (press) => {
    if (press.input !== "e") return scrollKey(press);
    setExpanded(!expanded);
    return true;
  });
  if (detail.value === null)
    return (
      <StatusLine
        text={detail.failed ? "Could not load the pull request. r retries." : "Loading timeline…"}
      />
    );
  return (
    <>
      <StatusLine
        text={
          activity.failed && activity.value === null
            ? "Could not load comments and commits. r retries."
            : activity.value === null
              ? "Loading comments and commits…"
              : `${activity.value.commits.length} commits · ${activity.value.commentCount} comments`
        }
      />
      <LinesView lines={lines} top={top} height={height - 1} />
    </>
  );
}
