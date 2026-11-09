import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  AuthTerminalOperateScope,
  AuthTerminalReadScope,
  sessionGrantsScope,
  type OrchestrationV2ShellSnapshot,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { projectScriptRuntimeEnv } from "@t3tools/shared/projectScripts";
import { resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { Box } from "ink";
import { useContext, useState } from "react";

import { Text } from "../../app/text.tsx";
import type { TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { usePaneRoute } from "../../state/panes.ts";
import { environmentSession } from "../../state/requests.ts";
import { environmentShell } from "../../state/shell.ts";
import { terminalEnvironment } from "../../state/threadTerminals.ts";
import { routeAtom, type Region } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import {
  closeTerminal,
  leaveTerminal,
  newTerminal,
  pickTerminal,
  renameTerminal,
  selectedTerminalAtom,
  terminalKey,
  terminalNamesAtom,
  terminalTabs,
  threadKey,
  threadTerminalIds,
} from "./model.ts";
import { type Launch, TerminalScreen } from "./TerminalScreen.tsx";

function ThreadTerminals(
  props: TuiViewProps & {
    readonly thread: ScopedThreadRef;
    readonly region: Region;
    readonly onBack?: () => void;
  },
) {
  const { thread, region, focused, width, height } = props;
  const registry = useContext(RegistryContext);
  const session = useAtomValue(environmentSession.sessionStateValueAtom(thread.environmentId));
  const operate = session !== null && sessionGrantsScope(session, AuthTerminalOperateScope);
  const read = session !== null && sessionGrantsScope(session, AuthTerminalReadScope);
  const metadata = useAtomValue(
    terminalEnvironment.metadata({ environmentId: thread.environmentId, input: null }),
  );
  const summaries = AsyncResult.getOrElse(metadata, () => []);
  const picked = useAtomValue(selectedTerminalAtom).get(threadKey(thread));
  const { tabs, selected } = terminalTabs(
    threadTerminalIds(summaries, thread),
    picked,
    operate && AsyncResult.isSuccess(metadata),
  );
  const names = useAtomValue(terminalNamesAtom);
  const snapshot = Option.getOrNull(
    useAtomValue(environmentShell.stateValueAtom(thread.environmentId)).snapshot,
  );
  const [typingWanted, setTyping] = useState(true);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [status, setStatus] = useState("starting");

  const label = (terminalId: string) =>
    names.get(terminalKey(thread, terminalId)) ??
    resolveTerminalSessionLabel(
      terminalId,
      summaries.find(
        (summary) => summary.threadId === thread.threadId && summary.terminalId === terminalId,
      ),
    );
  const launch = launchFor(snapshot, thread);
  const ready = selected !== null && (operate ? launch !== undefined : read);
  const typing = typingWanted && ready && operate;

  useRegionInput(
    region,
    (press) => {
      if (!focused) return false;
      if (renaming !== null) {
        if (press.key.ctrl) return false;
        // A fast typist's "name<enter>" can arrive as one input.
        const text = press.input.replace(/[\x00-\x1f]/gu, "");
        if (isKey(press, "escape")) setRenaming(null);
        else if (isKey(press, "backspace")) setRenaming(renaming.slice(0, -1));
        else if (isKey(press, "enter") || /[\r\n]/u.test(press.input)) {
          if (selected !== null)
            renameTerminal(registry, terminalKey(thread, selected), renaming + text);
          setRenaming(null);
        } else if (!press.key.meta) setRenaming(renaming + text);
        return true;
      }
      if (typing) return false;
      const index = tabs.indexOf(selected ?? "");
      const digit = /^[1-9]$/u.test(press.input) && !press.key.ctrl ? Number(press.input) : 0;
      if (isKey(press, "enter") || isKey(press, "i")) setTyping(true);
      else if (isKey(press, "]") && tabs.length > 0)
        pickTerminal(registry, thread, tabs[(index + 1) % tabs.length]!);
      else if (isKey(press, "[") && tabs.length > 0)
        pickTerminal(registry, thread, tabs[(index - 1 + tabs.length) % tabs.length]!);
      else if (digit > 0 && digit <= tabs.length) pickTerminal(registry, thread, tabs[digit - 1]!);
      else if (isKey(press, "n")) {
        newTerminal(registry, thread);
        setTyping(true);
      } else if (isKey(press, "x") && selected !== null) closeTerminal(registry, thread, selected);
      else if (isKey(press, "r") && selected !== null) setRenaming(label(selected));
      else if (isKey(press, "escape") && props.onBack) props.onBack();
      else return false;
      return true;
    },
    { first: true },
  );

  const hint =
    renaming !== null
      ? "enter saves · esc cancels"
      : typing
        ? "ctrl+\\ leaves"
        : operate
          ? "enter types · n new · x close · r rename · [ ] switch"
          : "read only";
  const header =
    renaming !== null ? (
      <Text wrap="truncate">
        <Text color={theme.textMuted}>Name: </Text>
        <Text color={theme.text}>{renaming}</Text>
        <Text inverse> </Text>
      </Text>
    ) : (
      <Text wrap="truncate">
        {tabs.map((terminalId, index) => (
          <Text
            key={terminalId}
            color={terminalId === selected ? theme.accent : theme.textMuted}
            bold={terminalId === selected}
          >
            {index > 0 ? "  " : ""}
            {index + 1} {label(terminalId)}
            {terminalId === selected && status !== "running" ? ` (${status})` : ""}
          </Text>
        ))}
        <Text color={theme.textFaint}>
          {tabs.length > 0 ? "  " : ""}
          {hint}
        </Text>
      </Text>
    );

  const body =
    !read && !operate ? (
      <Text color={theme.textFaint}>This connection may not see terminals.</Text>
    ) : selected === null ? (
      <Text color={theme.textFaint}>
        {operate ? "No terminal. Press n to start one." : "No terminal."}
      </Text>
    ) : !ready ? (
      <Text color={theme.textFaint}>Loading…</Text>
    ) : (
      <TerminalScreen
        key={selected}
        thread={thread}
        terminalId={selected}
        operate={operate}
        launch={launch ?? {}}
        region={region}
        focused={focused}
        typing={typing}
        width={width}
        height={Math.max(1, height - 1)}
        onLeave={() => setTyping(false)}
        onExit={() => leaveTerminal(registry, thread, selected)}
        onStatus={setStatus}
      />
    );
  return (
    <Box flexDirection="column" width={width} height={height}>
      {header}
      {body}
    </Box>
  );
}

/** Where a new shell starts: the thread's worktree, else its project. Undefined while loading. */
function launchFor(
  snapshot: OrchestrationV2ShellSnapshot | null,
  thread: ScopedThreadRef,
): Launch | undefined {
  if (snapshot === null) return undefined;
  const shell = snapshot.threads.find((entry) => entry.id === thread.threadId);
  const project = snapshot.projects.find((entry) => entry.id === shell?.projectId);
  if (shell === undefined || project === undefined) return {};
  const worktreePath = shell.worktreePath ?? null;
  return {
    cwd: worktreePath ?? project.workspaceRoot,
    worktreePath,
    env: projectScriptRuntimeEnv({ project: { cwd: project.workspaceRoot }, worktreePath }),
  };
}

/** The right panel: terminals of the focused pane's thread. */
export function TerminalPanel(props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) return <Text color={theme.textFaint}>Select a thread.</Text>;
  return <ThreadTerminals key={threadKey(thread)} thread={thread} region="panel" {...props} />;
}

/** The main view: terminals of this pane's thread; escape goes back to the thread. */
export function TerminalView(props: TuiViewProps) {
  const registry = useContext(RegistryContext);
  const thread = usePaneRoute().thread;
  if (thread === null) return <Text color={theme.textFaint}>Select a thread.</Text>;
  return (
    <ThreadTerminals
      key={threadKey(thread)}
      thread={thread}
      region="main"
      onBack={() => registry.set(routeAtom, { view: "thread", thread })}
      {...props}
    />
  );
}
