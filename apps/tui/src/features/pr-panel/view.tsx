import { useAtomValue } from "@effect/atom-react";
import { resolvePullRequestDetailChecks } from "@t3tools/client-runtime/pull-request-checks";
import type { PullRequestChecks } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { Box } from "ink";
import { useState } from "react";

import { Text } from "../../app/text.tsx";
import type { PullRequestTarget } from "../../app/feature.ts";
import { isKey, type KeyPress } from "../../app/keys.ts";
import { pullRequestAtoms } from "../../state/pullRequests.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { theme } from "../../theme/theme.ts";
import type { Line } from "../thread-view/lines.ts";
import { parseMarkdown, renderMarkdown } from "../thread-view/markdown.ts";

interface MarkdownNode {
  readonly type: string;
  children?: MarkdownNode[];
}

function dropHtml(node: MarkdownNode) {
  if (!node.children) return;
  node.children = node.children.filter((child) => child.type !== "html");
  node.children.forEach(dropHtml);
}

/** PR markdown without raw HTML blocks (bot badges, <details>), which a terminal cannot show. */
export function renderPullRequestMarkdown(text: string, width: number): Line[] {
  const tree = parseMarkdown(text);
  dropHtml(tree as MarkdownNode);
  const lines = renderMarkdown(tree, width);
  const start = lines.findIndex((line) => line.length > 0);
  return start === -1 ? [] : lines.slice(start, lines.findLastIndex((line) => line.length > 0) + 1);
}

export function resultState<A, E>(result: AsyncResult.AsyncResult<A, E>) {
  return {
    value: Option.getOrNull(AsyncResult.value(result)),
    failed: AsyncResult.isFailure(result),
    loading: AsyncResult.isInitial(result) || result.waiting,
  };
}

export const detailInput = ({ environmentId, reference }: PullRequestTarget) => ({
  environmentId,
  input: { ...reference, allowStale: false },
});

const noChecks = Atom.make(AsyncResult.success<PullRequestChecks | null>(null));

/** The detail with the newest checks merged in, as web's usePullRequestDetail does. */
export function usePullRequestDetail(target: PullRequestTarget) {
  const detail = resultState(useAtomValue(pullRequestAtoms.detail(detailInput(target))));
  const supportsChecks =
    useAtomValue(serverEnvironment.configValueAtom(target.environmentId))?.environment.capabilities
      .pullRequestChecks === true;
  const checks = resultState(
    useAtomValue(
      supportsChecks
        ? pullRequestAtoms.checks({ environmentId: target.environmentId, input: target.reference })
        : noChecks,
    ),
  );
  return { ...detail, value: resolvePullRequestDetailChecks(detail.value, checks.value, true) };
}

function Row({ line }: { readonly line: Line }) {
  // An empty Text takes no row in Ink.
  if (line.length === 0) return <Text> </Text>;
  return (
    <Text wrap="truncate">
      {line.map((part, index) => (
        <Text
          // oxlint-disable-next-line react/no-array-index-key -- spans of a line are positional and never reorder
          key={index}
          {...(part.color ? { color: part.color } : {})}
          bold={part.bold ?? false}
          italic={part.italic ?? false}
          underline={part.underline ?? false}
          strikethrough={part.strikethrough ?? false}
        >
          {part.text}
        </Text>
      ))}
    </Text>
  );
}

/** Renders only the rows of `lines` that fit, from `top`. */
export function LinesView(props: {
  readonly lines: ReadonlyArray<Line>;
  readonly top: number;
  readonly height: number;
}) {
  return (
    <Box flexDirection="column" height={props.height} overflow="hidden">
      {props.lines.slice(props.top, props.top + props.height).map((line, row) => (
        // oxlint-disable-next-line react/no-array-index-key -- rows are screen positions
        <Row key={row} line={line} />
      ))}
    </Box>
  );
}

/** Scroll position over `total` lines; `scrollKey` handles j/k, ctrl+d/u, page and g/G keys. */
export function useScroll(total: number, height: number) {
  const [top, setTop] = useState(0);
  const maxTop = Math.max(0, total - height);
  const clamped = Math.min(top, maxTop);
  const scrollTo = (next: number) => setTop(Math.max(0, Math.min(next, maxTop)));
  const scrollKey = (press: KeyPress): boolean => {
    const half = Math.max(1, Math.floor(height / 2));
    if (isKey(press, "arrowdown") || press.input === "j") scrollTo(clamped + 1);
    else if (isKey(press, "arrowup") || press.input === "k") scrollTo(clamped - 1);
    else if (isKey(press, "ctrl+d")) scrollTo(clamped + half);
    else if (isKey(press, "ctrl+u")) scrollTo(clamped - half);
    else if (isKey(press, "pagedown")) scrollTo(clamped + height);
    else if (isKey(press, "pageup")) scrollTo(clamped - height);
    else if (press.input === "g" || isKey(press, "home")) scrollTo(0);
    else if (press.input === "G" || isKey(press, "end")) scrollTo(maxTop);
    else return false;
    return true;
  };
  return { top: clamped, scrollTo, scrollKey };
}

/** One muted status line for loading, error and empty states, the same in every tab. */
export function StatusLine({ text }: { readonly text: string }) {
  return (
    <Text color={theme.textMuted} wrap="truncate">
      {text}
    </Text>
  );
}
