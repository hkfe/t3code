import { useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { CodeTab } from "./CodeTab.tsx";

function LinkedCode({ thread, ...props }: TuiViewProps & { readonly thread: ScopedThreadRef }) {
  const app = useAtomValue(environmentThreadDetails.threadAtom(thread))?.projection.thread;
  const linked = app?.linkedPullRequest ?? app?.branchPullRequest ?? null;
  if (linked === null)
    return <Text color={theme.textFaint}>No pull request linked to this thread.</Text>;
  const { projectId, repository, number } = linked;
  return (
    <CodeTab
      key={`${repository}#${number}`}
      target={{ environmentId: thread.environmentId, reference: { projectId, repository, number } }}
      {...props}
    />
  );
}

/** Stand-in until the PR panel hosts the Code tab: the open thread's linked pull request. */
export function CodePanel(props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) return <Text color={theme.textFaint}>Select a thread.</Text>;
  return (
    <LinkedCode key={`${thread.environmentId}:${thread.threadId}`} thread={thread} {...props} />
  );
}
