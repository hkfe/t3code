import { useAtomValue } from "@effect/atom-react";
import type { PullRequestActivity, PullRequestDetail } from "@t3tools/contracts";
import { useMemo } from "react";

import type { PrPanelTabProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { pullRequestAtoms } from "../../state/pullRequests.ts";
import { theme } from "../../theme/theme.ts";
import { span, wrap, type Line, type Span } from "../thread-view/lines.ts";
import {
  checksState,
  reviewerVerdicts,
  summarizeChecks,
  visibleBody,
  type ChecksState,
} from "./model.ts";
import {
  LinesView,
  renderPullRequestMarkdown,
  StatusLine,
  resultState,
  usePullRequestDetail,
  useScroll,
} from "./view.tsx";

const STATE = {
  open: { label: "Open", color: theme.success },
  merged: { label: "Merged", color: theme.syntax.typesComponents },
  closed: { label: "Closed", color: theme.danger },
} as const;

export const CHECKS_TONE: Record<ChecksState, { readonly glyph: string; readonly color: string }> =
  {
    passing: { glyph: "✓", color: theme.success },
    failing: { glyph: "✗", color: theme.danger },
    pending: { glyph: "●", color: theme.warning },
  };

const MERGEABILITY = {
  mergeable: { glyph: "✓", label: "No conflicts with the base branch", color: theme.success },
  conflicting: { glyph: "✗", label: "Conflicts with the base branch", color: theme.danger },
  unknown: { glyph: "?", label: "Checking for conflicts", color: theme.textMuted },
} as const;

const VERDICT = {
  approved: { glyph: "✓", color: theme.success },
  "changes-requested": { glyph: "✗", color: theme.danger },
  dismissed: { glyph: "–", color: theme.textMuted },
} as const;

const muted = (text: string) => span(text, { color: theme.textMuted });

function summaryLines(
  detail: PullRequestDetail,
  activity: PullRequestActivity | null,
  width: number,
): Line[] {
  const field = (label: string, value: ReadonlyArray<Span>) =>
    wrap(value, width, [muted(label.padEnd(11))], [span(" ".repeat(11))]);
  const state = STATE[detail.state];
  const draft = detail.state === "open" && detail.isDraft;
  const checks = checksState(detail.checks);
  const verdicts = reviewerVerdicts(
    activity?.reviewers ?? detail.reviewers,
    activity?.comments ?? [],
  );
  const merge = MERGEABILITY[detail.mergeability];
  const body = visibleBody(detail.body);
  return [
    ...wrap(
      [span(detail.title, { color: theme.text, bold: true })],
      width,
      [muted(`#${detail.number} `)],
      [span(" ".repeat(`#${detail.number} `.length))],
    ),
    [
      span(draft ? "◌ Draft" : `● ${state.label}`, {
        color: draft ? theme.textMuted : state.color,
        bold: true,
      }),
      muted(` · ${detail.repository}`),
    ],
    [],
    ...field("author", [span((activity?.author ?? detail.author)?.login ?? "unknown")]),
    ...field("branches", [
      span(detail.baseBranch, { color: theme.info }),
      muted(" ← "),
      span(detail.headBranch, { color: theme.info }),
    ]),
    ...field("changes", [
      span(`${detail.changedFiles} file${detail.changedFiles === 1 ? "" : "s"}  `),
      span(`+${detail.additions}`, { color: theme.success }),
      span(" "),
      span(`−${detail.deletions}`, { color: theme.danger }),
    ]),
    ...field("checks", [
      ...(checks
        ? [span(`${CHECKS_TONE[checks].glyph} `, { color: CHECKS_TONE[checks].color })]
        : []),
      span(summarizeChecks(detail.checks)),
    ]),
    ...(detail.state === "open"
      ? field("merge", [span(`${merge.glyph} `, { color: merge.color }), span(merge.label)])
      : []),
    ...field(
      "reviewers",
      verdicts.length === 0
        ? [muted("none")]
        : verdicts.flatMap(({ login, outcome }, index) => [
            ...(index > 0 ? [muted(", ")] : []),
            ...(outcome
              ? [span(`${VERDICT[outcome].glyph} `, { color: VERDICT[outcome].color })]
              : []),
            span(login),
          ]),
    ),
    ...(detail.labels.length > 0
      ? field("labels", [
          span(detail.labels.map((label) => label.name).join(", "), { color: theme.accent }),
        ])
      : []),
    [],
    [span("─".repeat(Math.max(1, width)), { color: theme.border })],
    ...(body === null
      ? [[muted("No description provided.")]]
      : renderPullRequestMarkdown(body, width)),
  ];
}

export function SummaryTab({ target, width, height }: PrPanelTabProps) {
  const detail = usePullRequestDetail(target);
  const activity = resultState(
    useAtomValue(
      pullRequestAtoms.activity({ environmentId: target.environmentId, input: target.reference }),
    ),
  ).value;
  const lines = useMemo(
    () => (detail.value === null ? [] : summaryLines(detail.value, activity, width)),
    [detail.value, activity, width],
  );
  const { top, scrollKey } = useScroll(lines.length, height);
  useRegionInput("panel", scrollKey);
  if (detail.value === null)
    return (
      <StatusLine
        text={
          detail.failed ? "Could not load the pull request. r retries." : "Loading pull request…"
        }
      />
    );
  return <LinesView lines={lines} top={top} height={height} />;
}
