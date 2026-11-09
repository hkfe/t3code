import type {
  EnvironmentId,
  PullRequestCheck,
  PullRequestRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { ArrowUpRightIcon, ChevronRightIcon, CopyIcon, HammerIcon } from "lucide-react";
import { useState } from "react";

import { useOpenLink } from "~/browser/useOpenLink";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { RefreshIcon } from "../ui/refresh-icon";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  groupPullRequestChecks,
  pullRequestCheckDuration,
  pullRequestFindingKey,
  type PullRequestFinding,
} from "./pullRequestDetail.logic";
import {
  PullRequestCheckStatusIcon,
  PullRequestSectionLabel,
  pullRequestCheckStatusLabel,
  pullRequestChecksState,
  pullRequestChecksStatePresentation,
  summarizePullRequestChecks,
} from "./pullRequestPresentation";

export function PullRequestChecksTabBadge({ checks }: { checks: ReadonlyArray<PullRequestCheck> }) {
  const { attention, running } = groupPullRequestChecks(checks);
  const failing = attention.filter((check) => check.status !== "action-required").length;
  if (checks.length === 0) return null;
  return failing > 0 ? (
    <Badge size="sm" variant="error" aria-label={`${failing} failing`}>
      {failing}
    </Badge>
  ) : running.length > 0 ? (
    <Badge size="sm" variant="warning" aria-label={`${running.length} running`}>
      {running.length}
    </Badge>
  ) : (
    <Badge size="sm" variant="success" aria-label={`${checks.length} checks`}>
      {checks.length}
    </Badge>
  );
}

export function PullRequestChecksTab({
  scrollerRef,
  environmentId,
  reference,
  threadRef,
  checks,
  stale,
  openLabel,
  pendingFinding,
  fixCheckLabel,
  onFixFinding,
  onRefreshChecks,
}: {
  scrollerRef: (node: HTMLElement | null) => void;
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  threadRef: ScopedThreadRef | null;
  checks: ReadonlyArray<PullRequestCheck>;
  stale: boolean;
  openLabel: string;
  pendingFinding: string | null;
  fixCheckLabel: string;
  onFixFinding?: (finding: PullRequestFinding) => void;
  onRefreshChecks: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const { attention, running, completed } = groupPullRequestChecks(checks);
  const sections = [
    { label: "Needs attention", checks: attention },
    { label: "Running", checks: running },
    { label: "Completed", checks: completed },
  ].filter((section) => section.checks.length > 0);
  const state = pullRequestChecksState(checks);
  const presentation = state === null ? null : pullRequestChecksStatePresentation(state);
  return (
    <div ref={scrollerRef} className="scrollbar-gutter-both h-full overflow-y-auto px-4 py-5">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-5 flex items-center gap-2.5 px-1">
          {presentation ? (
            <presentation.Icon
              aria-hidden
              className={cn("size-4 shrink-0", presentation.toneClassName)}
            />
          ) : null}
          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
            {summarizePullRequestChecks(checks)}
          </span>
          {stale ? (
            <>
              <span className="text-2xs text-muted-foreground">Out of date</span>
              <Button size="xs" variant="ghost" onClick={onRefreshChecks}>
                Refresh
              </Button>
            </>
          ) : null}
        </div>
        {sections.map((section) => (
          <section key={section.label} className="mb-5">
            <PullRequestSectionLabel className="mb-2">
              {section.label}
              <span className="tabular-nums text-muted-foreground/70">{section.checks.length}</span>
            </PullRequestSectionLabel>
            <ul className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/60 bg-card">
              {section.checks.map((check, index) => {
                // Check names and URLs can repeat across workflows.
                const key = `${section.label}:${index}:${check.name}:${check.url ?? ""}`;
                return (
                  <CheckRow
                    key={key}
                    environmentId={environmentId}
                    reference={reference}
                    threadRef={threadRef}
                    check={check}
                    expanded={expanded === key}
                    onToggle={() => setExpanded(expanded === key ? null : key)}
                    openLabel={openLabel}
                    pendingFinding={pendingFinding}
                    fixCheckLabel={fixCheckLabel}
                    {...(onFixFinding ? { onFixFinding } : {})}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function CheckRow({
  environmentId,
  reference,
  threadRef,
  check,
  expanded,
  onToggle,
  openLabel,
  pendingFinding,
  fixCheckLabel,
  onFixFinding,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  threadRef: ScopedThreadRef | null;
  check: PullRequestCheck;
  expanded: boolean;
  onToggle: () => void;
  openLabel: string;
  pendingFinding: string | null;
  fixCheckLabel: string;
  onFixFinding?: (finding: PullRequestFinding) => void;
}) {
  const openLink = useOpenLink(threadRef);
  const logQuery = useEnvironmentQuery(
    expanded && check.url
      ? pullRequestEnvironment.checkLog({ environmentId, input: { ...reference, url: check.url } })
      : null,
  );
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "check log" });
  const failing = check.status === "failure" || check.status === "cancelled";
  const finding: PullRequestFinding = {
    kind: "check",
    check,
    ...(logQuery.data ? { log: logQuery.data.text } : {}),
  };
  const duration = pullRequestCheckDuration(check);
  const open = (url: string) =>
    void openLink(url).catch((error: unknown) => {
      console.error(error);
      toastManager.add({ type: "error", title: "Unable to open check details" });
    });
  const log = logQuery.data;

  return (
    <li>
      <div className="group flex items-center gap-1 pr-1.5 hover:bg-accent/60">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 px-3 py-2.5 text-left text-xs leading-5 [&>svg]:mt-0.5"
        >
          <ChevronRightIcon
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground/60 transition-transform",
              expanded && "rotate-90",
            )}
          />
          <PullRequestCheckStatusIcon status={check.status} />
          <span className="min-w-0 flex-1 wrap-anywhere">{check.name}</span>
          {duration ? (
            <span className="shrink-0 tabular-nums text-muted-foreground">{duration}</span>
          ) : null}
          <span className="shrink-0 text-muted-foreground">
            {pullRequestCheckStatusLabel(check)}
          </span>
        </button>
        {onFixFinding && failing ? (
          <Button
            size="xs"
            variant="ghost"
            className="shrink-0"
            disabled={pendingFinding !== null}
            onClick={() => onFixFinding(finding)}
          >
            <HammerIcon className="size-3" />
            {pendingFinding === pullRequestFindingKey(finding) ? "Preparing..." : fixCheckLabel}
          </Button>
        ) : null}
        {check.url ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-xs"
                  variant="ghost-muted"
                  className="shrink-0"
                  aria-label={openLabel}
                  onClick={() => check.url && open(check.url)}
                />
              }
            >
              <ArrowUpRightIcon aria-hidden />
            </TooltipTrigger>
            <TooltipPopup side="top">{openLabel}</TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
      {expanded ? (
        <div className="mr-3 mb-3 ml-8.5 overflow-hidden rounded-md border border-border/60 text-xs">
          <div className="flex min-h-9 items-center gap-1 px-2 py-1 text-muted-foreground sm:min-h-8">
            {!check.url ? (
              <span className="min-w-0 flex-1">The host reported no log for this check.</span>
            ) : logQuery.error ? (
              <>
                <span className="min-w-0 flex-1">
                  Could not load the log. It may have expired, or this account cannot read it.
                </span>
                <Button size="xs" variant="ghost" onClick={logQuery.refresh}>
                  Retry
                </Button>
              </>
            ) : !logQuery.isSuccess && !log ? (
              <span className="min-w-0 flex-1">Loading log…</span>
            ) : !log ? (
              <>
                <span className="min-w-0 flex-1">
                  Logs are only available on {checkHostName(check.url)}.
                </span>
                <Button size="xs" variant="ghost" onClick={() => check.url && open(check.url)}>
                  Open
                </Button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate">
                  {log.failedStep ? "Failing step" : "End of log"}
                  {log.truncated ? " (trimmed)" : ""}
                </span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost-muted"
                        aria-label={isCopied ? "Copied" : "Copy log"}
                        disabled={log.text.length === 0}
                        onClick={() => copyToClipboard(log.text)}
                      />
                    }
                  >
                    <CopyIcon aria-hidden />
                  </TooltipTrigger>
                  <TooltipPopup side="top">{isCopied ? "Copied" : "Copy log"}</TooltipPopup>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-xs"
                        variant="ghost-muted"
                        aria-label="Refresh log"
                        onClick={logQuery.refresh}
                      />
                    }
                  >
                    <RefreshIcon refreshing={logQuery.isPending} />
                  </TooltipTrigger>
                  <TooltipPopup side="top">Refresh log</TooltipPopup>
                </Tooltip>
              </>
            )}
          </div>
          {log ? (
            log.text.length === 0 ? (
              <p className="border-t border-border/60 px-2 py-2 text-muted-foreground">
                The log is empty.
              </p>
            ) : (
              <pre className="max-h-96 overflow-auto border-t border-border/60 bg-muted/40 px-2 py-2 font-mono text-xs leading-5 whitespace-pre">
                {log.text}
              </pre>
            )
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function checkHostName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "the check's host";
  }
}
