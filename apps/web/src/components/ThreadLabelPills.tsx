import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentId,
  type ScopedThreadRef,
  type ThreadLabel,
  type ThreadLabelColor,
  threadLabelsOf,
} from "@t3tools/contracts";

import { cn } from "../lib/utils";
import { useQuietThreadShell } from "../state/entities";
import { serverEnvironment } from "../state/server";

export const THREAD_LABEL_COLOR_CLASS: Record<ThreadLabelColor, string> = {
  gray: "bg-zinc-500/12 text-zinc-600 dark:text-zinc-300",
  red: "bg-red-500/12 text-red-600 dark:text-red-300",
  orange: "bg-orange-500/12 text-orange-600 dark:text-orange-300",
  amber: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  green: "bg-green-500/12 text-green-700 dark:text-green-300",
  teal: "bg-teal-500/12 text-teal-700 dark:text-teal-300",
  blue: "bg-blue-500/12 text-blue-600 dark:text-blue-300",
  violet: "bg-violet-500/12 text-violet-600 dark:text-violet-300",
  pink: "bg-pink-500/12 text-pink-600 dark:text-pink-300",
};

export function useThreadLabels(
  environmentId: EnvironmentId,
  tags: ReadonlyArray<string> | undefined,
): ReadonlyArray<ThreadLabel> {
  const labels = useAtomValue(serverEnvironment.settingsValueAtom(environmentId))?.threadLabels;
  return threadLabelsOf(tags, labels);
}

export function ThreadLabelPill(props: { label: ThreadLabel; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-4 max-w-24 min-w-0 items-center rounded-full px-1.5 text-3xs leading-none font-medium",
        THREAD_LABEL_COLOR_CLASS[props.label.color],
        props.className,
      )}
    >
      <span className="truncate">{props.label.name}</span>
    </span>
  );
}

/** Compact pills for a thread's labels; past `max` the rest fold into a count. */
export function ThreadLabelPills(props: {
  environmentId: EnvironmentId;
  tags: ReadonlyArray<string> | undefined;
  max?: number;
  className?: string;
}) {
  const labels = useThreadLabels(props.environmentId, props.tags);
  if (labels.length === 0) return null;
  const max = props.max ?? 2;
  const shown = labels.slice(0, max);
  return (
    <span
      role="group"
      className={cn("inline-flex min-w-0 shrink items-center gap-1", props.className)}
      aria-label={`Labels: ${labels.map((label) => label.name).join(", ")}`}
    >
      {shown.map((label) => (
        <ThreadLabelPill key={label.id} label={label} />
      ))}
      {labels.length > max ? (
        <span className="shrink-0 text-3xs text-muted-foreground">+{labels.length - max}</span>
      ) : null}
    </span>
  );
}

/** Reads the shell itself, so a parent does not re-render on every shell change. */
export function ThreadRefLabelPills(props: { threadRef: ScopedThreadRef; max?: number }) {
  const tags = useQuietThreadShell(props.threadRef)?.tags;
  return (
    <ThreadLabelPills
      environmentId={props.threadRef.environmentId}
      tags={tags}
      {...(props.max === undefined ? {} : { max: props.max })}
    />
  );
}
