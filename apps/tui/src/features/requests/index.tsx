import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  sessionGrantsScope,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import type { AtomRegistry } from "effect/reactivity";
import { Text } from "ink";
import { useContext } from "react";

import type { TuiFeature, TuiViewProps } from "../../app/feature.ts";
import { environmentSession, requestCommands } from "../../state/requests.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { focusAtom, layoutAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { needsYouAtom, nextThread, sameThread } from "./needsYou.ts";
import { RequestCard, type RequestActions } from "./RequestCard.tsx";

const PANEL = "requests";

function failureMessage(result: AtomCommandResult<unknown, unknown>): string | null {
  if (result._tag === "Success" || isAtomCommandInterrupted(result)) return null;
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "The server did not take the answer.";
}

function closePanel(registry: AtomRegistry.AtomRegistry) {
  registry.set(layoutAtom, { ...registry.get(layoutAtom), panel: null });
  registry.set(focusAtom, "main");
}

/** Opens the panel on the open thread if it waits on the user, else on the next one that does. */
function jumpToNext(registry: AtomRegistry.AtomRegistry) {
  const waiting = registry.get(needsYouAtom);
  const route = registry.get(routeAtom);
  const layout = registry.get(layoutAtom);
  const current = route.thread;
  const stay =
    current !== null && layout.panel !== PANEL && waiting.some((ref) => sameThread(ref, current));
  const target = stay ? current : nextThread(waiting, current);
  if (target) registry.set(routeAtom, { view: "thread", thread: target });
  registry.set(layoutAtom, { ...layout, panel: PANEL });
  registry.set(focusAtom, "panel");
}

function ThreadRequests(props: TuiViewProps & { readonly thread: ScopedThreadRef }) {
  const registry = useContext(RegistryContext);
  const { thread } = props;
  const requests = useAtomValue(environmentThreadDetails.pendingRequestsAtom(thread));
  const canRespond = useAtomValue(
    environmentSession.sessionStateValueAtom(thread.environmentId),
    (session) => session !== null && sessionGrantsScope(session, AuthOrchestrationOperateScope),
  );
  const target = { environmentId: thread.environmentId };
  const options = { reportFailure: false };
  const actions: RequestActions = {
    respondToApproval: (requestId, decision, feedback) =>
      runAtomCommand(
        registry,
        requestCommands.respondToApproval,
        {
          ...target,
          input: {
            threadId: thread.threadId,
            requestId,
            decision,
            ...(feedback === undefined ? {} : { feedback }),
          },
        },
        options,
      ).then(failureMessage),
    respondToUserInput: (requestId, answers) =>
      runAtomCommand(
        registry,
        requestCommands.respondToUserInput,
        { ...target, input: { threadId: thread.threadId, requestId, answers } },
        options,
      ).then(failureMessage),
    dismissUserInput: (requestId) =>
      runAtomCommand(
        registry,
        requestCommands.dismissUserInput,
        { ...target, input: { threadId: thread.threadId, requestId } },
        options,
      ).then(failureMessage),
    defer: () => closePanel(registry),
  };
  return (
    <RequestCard
      thread={thread}
      requests={requests}
      canRespond={canRespond}
      actions={actions}
      focused={props.focused}
      height={props.height}
    />
  );
}

function RequestsPanel(props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null)
    return <Text color={theme.textFaint}>Open a thread to see its requests.</Text>;
  return (
    <ThreadRequests key={`${thread.environmentId}:${thread.threadId}`} {...props} thread={thread} />
  );
}

function NeedsYouStatus() {
  const count = useAtomValue(needsYouAtom, (waiting) => waiting.length);
  if (count === 0) return null;
  return (
    <Text color={theme.warning} bold wrap="truncate">
      {count} need you · ctrl+r
    </Text>
  );
}

export const requestsFeature: TuiFeature = {
  id: "requests",
  commands: [
    {
      id: "requests.next",
      title: "Answer the next approval or question",
      run: ({ registry }) => jumpToNext(registry),
    },
  ],
  keybindings: [
    { key: "mod+r", command: "requests.next", when: ({ overlay }) => overlay === null },
  ],
  panels: [{ id: PANEL, title: "Needs you", component: RequestsPanel }],
  statusItems: [{ id: "requests.count", align: "right", component: NeedsYouStatus }],
};
