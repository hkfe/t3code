import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, PullRequestRef } from "@t3tools/contracts";
import { useContext, useMemo, useState } from "react";

import type { TuiViewProps } from "../../app/feature.ts";
import { pullRequestAtoms } from "../../state/pullRequests.ts";
import { CodeBrowser, type ViewedFiles } from "./CodeBrowser.tsx";
import { parsePatch } from "./patch.ts";
import { queryState } from "./query.ts";
import { useLocalViewed } from "./useLocalViewed.ts";

export interface PullRequestTarget {
  readonly environmentId: EnvironmentId;
  readonly reference: PullRequestRef;
}

/** Viewed marks on the host, shown at once and reverted when the write fails. */
function useHostViewed(target: PullRequestTarget): ViewedFiles {
  const registry = useContext(RegistryContext);
  const viewedAtom = pullRequestAtoms.filesViewed({
    environmentId: target.environmentId,
    input: target.reference,
  });
  const answer = queryState(useAtomValue(viewedAtom)).data;
  // ponytail: presses stay in this overlay until the tab unmounts; web retires them once a read
  // has seen the write (filesViewedStore.ts). Port that if a push during review shows stale marks.
  const [pressed, setPressed] = useState<ReadonlyMap<string, boolean>>(new Map());
  return {
    isViewed: (path) =>
      pressed.get(path) ??
      answer?.files.some((file) => file.path === path && file.state === "viewed") === true,
    setViewed: (path, viewed) => {
      setPressed((previous) => new Map(previous).set(path, viewed));
      void runAtomCommand(registry, pullRequestAtoms.setFilesViewed, {
        environmentId: target.environmentId,
        input: { ...target.reference, files: [{ path, viewed }] },
      }).then((result) => {
        if (result._tag === "Failure")
          setPressed((previous) => {
            const next = new Map(previous);
            if (next.get(path) === viewed) next.delete(path);
            return next;
          });
        registry.refresh(viewedAtom);
      });
    },
  };
}

function HostViewedBrowser(
  props: Omit<Parameters<typeof CodeBrowser>[0], "viewed"> & { readonly target: PullRequestTarget },
) {
  const { target, ...rest } = props;
  return <CodeBrowser {...rest} viewed={useHostViewed(target)} />;
}

function LocalViewedBrowser(
  props: Omit<Parameters<typeof CodeBrowser>[0], "viewed"> & { readonly scopeKey: string },
) {
  const { scopeKey, ...rest } = props;
  return <CodeBrowser {...rest} viewed={useLocalViewed(scopeKey)} />;
}

/** The PR panel's Code tab: changed files of the pull request or of one of its commits. */
export function CodeTab({
  target,
  width,
  height,
}: TuiViewProps & { readonly target: PullRequestTarget }) {
  const { environmentId, reference } = target;
  const [commit, setCommit] = useState<string | null>(null);
  const detail = queryState(
    useAtomValue(pullRequestAtoms.detail({ environmentId, input: reference })),
  ).data;
  const activity = queryState(
    useAtomValue(pullRequestAtoms.activity({ environmentId, input: reference })),
  ).data;
  const commits = useMemo(
    () =>
      (activity?.commits ?? []).toSorted(
        (a, b) => Date.parse(b.committedDate) - Date.parse(a.committedDate),
      ),
    [activity?.commits],
  );
  const diff = queryState(
    useAtomValue(
      pullRequestAtoms.diff({
        environmentId,
        input: { ...reference, ...(commit === null ? {} : { commit }) },
      }),
    ),
  );
  const files = useMemo(() => parsePatch(diff.data?.patch ?? ""), [diff.data?.patch]);

  const scopes = [null, ...commits.map((entry) => entry.oid)];
  const selected = commits.find((entry) => entry.oid === commit);
  const omitted = diff.data?.nextCursor ? " · more files on the host" : "";
  const props = {
    files,
    status: diff.error ?? (diff.waiting ? "Loading diff…" : "No file changes."),
    scope: `${selected ? `${selected.oid.slice(0, 7)} ${selected.messageHeadline}` : "All commits"}${omitted}`,
    ...(commits.length > 0
      ? {
          onScope: (step: 1 | -1) =>
            setCommit(
              scopes[(scopes.indexOf(commit) + step + scopes.length) % scopes.length] ?? null,
            ),
        }
      : {}),
    region: "panel" as const,
    width,
    height,
  };
  const scopeKey = JSON.stringify([environmentId, reference.repository, reference.number]);
  // A host without viewed files keeps the marks in this session only.
  return detail?.capabilities.viewedFiles === undefined ? (
    <LocalViewedBrowser {...props} scopeKey={scopeKey} />
  ) : (
    <HostViewedBrowser {...props} target={target} />
  );
}
