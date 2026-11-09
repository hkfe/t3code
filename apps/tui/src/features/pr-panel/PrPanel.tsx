import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";
import { Box } from "ink";
import { useContext, useState } from "react";

import { Text } from "../../app/text.tsx";
import type { PullRequestTarget, TuiPrPanelTab, TuiViewProps } from "../../app/feature.ts";
import { useRegionInput } from "../../app/input.tsx";
import { useShellRegistry } from "../../app/registry.ts";
import { pullRequestAtoms } from "../../state/pullRequests.ts";
import { environmentShell } from "../../state/shell.ts";
import { routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { groupChecks, targetKey, threadPullRequestTargets } from "./model.ts";
import { StatusLine, detailInput, usePullRequestDetail } from "./view.tsx";

function useThreadTargets(thread: ScopedThreadRef) {
  const shell = useAtomValue(environmentShell.stateValueAtom(thread.environmentId), (state) =>
    Option.match(state.snapshot, {
      onNone: () => undefined,
      onSome: ({ threads, archivedThreads }) =>
        threads.find((entry) => entry.id === thread.threadId) ??
        archivedThreads.find((entry) => entry.id === thread.threadId),
    }),
  );
  return shell === undefined ? null : threadPullRequestTargets(thread.environmentId, shell);
}

function ChecksBadge({ target }: { readonly target: PullRequestTarget }) {
  const checks = usePullRequestDetail(target).value?.checks ?? [];
  if (checks.length === 0) return null;
  const { attention, running } = groupChecks(checks);
  const failing = attention.filter((check) => check.status !== "action-required").length;
  const [count, color] =
    failing > 0
      ? [failing, theme.danger]
      : running.length > 0
        ? [running.length, theme.warning]
        : [checks.length, theme.success];
  return <Text color={color}> {count}</Text>;
}

/** Panel keys. It mounts after the active tab (keyed by it), so the tab sees each key first. */
function PanelKeys(props: {
  readonly tabs: ReadonlyArray<TuiPrPanelTab>;
  readonly tab: number;
  readonly setTab: (index: number) => void;
  readonly targets: ReadonlyArray<PullRequestTarget>;
  readonly setTarget: (key: string) => void;
  readonly target: PullRequestTarget;
}) {
  const registry = useContext(RegistryContext);
  const { tabs, tab, targets, target } = props;
  useRegionInput("panel", (press) => {
    const digit = Number(press.input);
    if (press.input === "]") props.setTab((tab + 1) % tabs.length);
    else if (press.input === "[") props.setTab((tab - 1 + tabs.length) % tabs.length);
    else if (Number.isInteger(digit) && digit >= 1 && digit <= tabs.length) props.setTab(digit - 1);
    else if (press.input === "n" && targets.length > 1) {
      const index = targets.findIndex((entry) => targetKey(entry) === targetKey(target));
      props.setTarget(targetKey(targets[(index + 1) % targets.length]!));
    } else if (press.input === "r") {
      const input = { environmentId: target.environmentId, input: target.reference };
      registry.refresh(pullRequestAtoms.detail(detailInput(target)));
      registry.refresh(pullRequestAtoms.activity(input));
      registry.refresh(pullRequestAtoms.checks(input));
    } else return false;
    return true;
  });
  return null;
}

function ThreadPullRequests(props: TuiViewProps & { readonly thread: ScopedThreadRef }) {
  const { tabs, tabIndex, setTabIndex } = useTabs();
  const targets = useThreadTargets(props.thread);
  const [chosen, setChosen] = useState<string | null>(null);
  if (targets === null) return <StatusLine text="Loading thread…" />;
  const target = targets.find((entry) => targetKey(entry) === chosen) ?? targets[0];
  if (target === undefined) return <StatusLine text="This thread has no linked pull request." />;
  const tab = tabs[tabIndex];
  const position = targets.indexOf(target);
  const key = targetKey(target);
  return (
    <Box flexDirection="column" height={props.height}>
      <Text wrap="truncate">
        <Text color={theme.textMuted}>
          {target.reference.repository} #{target.reference.number}
        </Text>
        {targets.length > 1 ? (
          <Text color={theme.textFaint}>
            {"  "}
            {position + 1}/{targets.length} · n next
          </Text>
        ) : null}
      </Text>
      <Text wrap="truncate">
        {tabs.map((entry, index) => (
          <Text key={entry.id}>
            <Text color={theme.border}>{index === 0 ? "" : " │ "}</Text>
            <Text
              color={index === tabIndex ? theme.accent : theme.textMuted}
              bold={index === tabIndex}
              underline={index === tabIndex}
            >
              {entry.title}
            </Text>
            {entry.id === "checks" ? <ChecksBadge target={target} /> : null}
          </Text>
        ))}
      </Text>
      {tab ? (
        <>
          <tab.component
            key={`${tab.id}:${key}`}
            target={target}
            focused={props.focused}
            width={props.width}
            height={Math.max(1, props.height - 2)}
          />
          <PanelKeys
            key={`keys:${tab.id}:${key}`}
            tabs={tabs}
            tab={tabIndex}
            setTab={setTabIndex}
            targets={targets}
            setTarget={setChosen}
            target={target}
          />
        </>
      ) : null}
    </Box>
  );
}

/** The active tab id; it stays while the user moves between threads. */
const activeTabAtom = Atom.make("summary").pipe(Atom.keepAlive);

function useTabs() {
  const registry = useContext(RegistryContext);
  const tabs = useShellRegistry().prPanelTabs;
  const active = useAtomValue(activeTabAtom);
  const tabIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === active),
  );
  const setTabIndex = (index: number) => registry.set(activeTabAtom, tabs[index]?.id ?? "summary");
  return { tabs, tabIndex, setTabIndex };
}

export function PrPanel(props: TuiViewProps) {
  const thread = useAtomValue(routeAtom).thread;
  if (thread === null) return <StatusLine text="Open a thread to see its pull requests." />;
  return (
    <ThreadPullRequests
      key={`${thread.environmentId}:${thread.threadId}`}
      {...props}
      thread={thread}
    />
  );
}
