import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { deriveThreadCheckpointSummaries } from "@t3tools/client-runtime/state/thread-checkpoints";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { Text } from "ink";
import { useContext, useMemo, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { orchestrationEnvironment } from "../../state/orchestration.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { CodeBrowser } from "./CodeBrowser.tsx";
import { parsePatch } from "./patch.ts";
import { queryState } from "./query.ts";
import { useLocalViewed } from "./useLocalViewed.ts";

export const CHANGES_VIEW = "diff.changes";

/** Turn null is the whole thread; otherwise the one turn's checkpoint diff. */
function useCheckpointPatch(thread: ScopedThreadRef, turn: number | null, latest: number) {
  const { environmentId, threadId } = thread;
  const atom =
    turn === null
      ? orchestrationEnvironment.fullThreadDiff({
          environmentId,
          input: { threadId, toTurnCount: latest },
        })
      : orchestrationEnvironment.turnDiff({
          environmentId,
          input: { threadId, fromTurnCount: turn - 1, toTurnCount: turn },
        });
  return queryState(useAtomValue(atom));
}

function Changes({
  thread,
  width,
  height,
}: Omit<TuiViewProps, "focused"> & { readonly thread: ScopedThreadRef }) {
  const detail = useAtomValue(environmentThreadDetails.threadAtom(thread));
  const turns = useMemo(
    () =>
      detail === null || detail === undefined
        ? []
        : deriveThreadCheckpointSummaries(detail.projection)
            .filter((checkpoint) => checkpoint.status === "ready")
            .map((checkpoint) => checkpoint.checkpointTurnCount)
            .toSorted((a, b) => b - a),
    [detail],
  );
  if (turns.length === 0)
    return (
      <Text color={theme.textFaint}>
        {detail ? "No checkpoints in this thread yet." : "Loading thread…"}
      </Text>
    );
  return <TurnChanges thread={thread} turns={turns} width={width} height={height} />;
}

function TurnChanges({
  thread,
  turns,
  width,
  height,
}: Omit<TuiViewProps, "focused"> & {
  readonly thread: ScopedThreadRef;
  readonly turns: ReadonlyArray<number>;
}) {
  const [turn, setTurn] = useState<number | null>(null);
  const diff = useCheckpointPatch(thread, turn, turns[0] ?? 0);
  const files = useMemo(() => parsePatch(diff.data?.diff ?? ""), [diff.data?.diff]);
  const viewed = useLocalViewed(JSON.stringify([thread.environmentId, thread.threadId, turn]));
  const scopes = [null, ...turns];
  const registry = useContext(RegistryContext);
  return (
    <CodeBrowser
      files={files}
      status={diff.error ?? (diff.waiting ? "Loading diff…" : "No file changes.")}
      scope={turn === null ? `All turns (${turns.length})` : `Turn ${turn}`}
      onScope={(step) =>
        setTurn(scopes[(scopes.indexOf(turn) + step + scopes.length) % scopes.length] ?? null)
      }
      viewed={viewed}
      onBack={() => registry.set(routeAtom, { view: "thread", thread })}
      region="main"
      width={width}
      height={height}
    />
  );
}

/** The open thread's checkpoint diffs, as the web Changes panel shows them. Viewed marks stay local. */
export function ChangesView(props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) return <Text color={theme.textFaint}>Select a thread.</Text>;
  return <Changes key={`${thread.environmentId}:${thread.threadId}`} thread={thread} {...props} />;
}
