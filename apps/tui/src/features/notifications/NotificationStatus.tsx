import { RegistryContext, useAtomValue } from "@effect/atom-react";
import { Text, useStdout } from "ink";
import { useContext, useEffect, type ReactNode } from "react";

import { theme } from "../../theme/theme.ts";
import { startNotifications } from "./notifier.ts";
import { statusSummaryAtom } from "./statusSummary.ts";
import type { ThreadStatus } from "./threadNotifications.ts";

const STATUS: Record<ThreadStatus, { readonly label: string; readonly color: string }> = {
  approval: { label: "Needs approval", color: theme.warning },
  input: { label: "Needs input", color: theme.warning },
  request: { label: "Guest request", color: theme.warning },
  working: { label: "Working", color: theme.accent },
  waiting: { label: "Waiting", color: theme.info },
  failed: { label: "Failed", color: theme.danger },
  limited: { label: "Usage limit", color: theme.danger },
  ready: { label: "Ready", color: theme.textMuted },
};

/** Working and waiting counts and the open thread's state (requests shows "need you"). One line, so the end truncates first. */
export function NotificationStatus() {
  const registry = useContext(RegistryContext);
  const { stdout } = useStdout();
  const summary = useAtomValue(statusSummaryAtom);
  // The status bar is always mounted, so it owns the notification watcher's lifetime.
  useEffect(() => startNotifications(registry, (data) => stdout.write(data)), [registry, stdout]);

  const { current } = summary;
  // Highest priority first: a narrow terminal cuts from the end.
  const parts: ReactNode[] = [];
  if (current) {
    const { label, color } = STATUS[current.status];
    const phase = current.status === "working" && current.phase ? ` · ${current.phase}` : "";
    parts.push(
      <Text key="current" color={color}>
        {label}
        {phase}
      </Text>,
    );
  }
  if (summary.working > 0) {
    parts.push(
      <Text key="working" color={theme.accent}>
        {summary.working} working
      </Text>,
    );
  }
  if (summary.waiting > 0) {
    parts.push(
      <Text key="waiting" color={theme.info}>
        {summary.waiting} waiting
      </Text>,
    );
  }
  if (current)
    parts.push(
      <Text key="model" color={theme.textFaint}>
        {current.model}
      </Text>,
    );
  if (parts.length === 0) return null;
  return (
    <Text wrap="truncate">
      {parts.flatMap((part, index) => (index === 0 ? [part] : ["  ", part]))}
    </Text>
  );
}
