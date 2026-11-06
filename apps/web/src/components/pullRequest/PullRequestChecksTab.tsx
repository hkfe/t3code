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
import { PullRequestCheckStatusIcon, pullRequestCheckStatusLabel } from "./pullRequestPresentation";

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
  const ordered = [...attention, ...running, ...completed];
  return (
    <div ref={scrollerRef} className="h-full overflow-y-auto px-4 py-3">
      {stale ? (
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>Check details are out of date.</span>
          <Button size="xs" variant="ghost" onClick={onRefreshChecks}>
            Refresh
          </Button>
        </div>
      ) : null}
      {ordered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No checks reported.</p>
      ) : (
        <ul className="space-y-0.5">
          {ordered.map((check, index) => {
            // Check names and URLs can repeat across workflows.
            const key = `${index}:${check.name}:${check.url ?? ""}`;
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
      )}
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
    <li className="rounded-md">
      <div className="group flex items-center gap-1 rounded-md pr-1 hover:bg-accent/60">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-left text-xs leading-5 [&>svg]:mt-0.5"
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
        <div className="mt-1 mb-2 ml-7 text-xs">
          {!check.url ? (
            <p className="text-muted-foreground">The host reported no log for this check.</p>
          ) : logQuery.error ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span>
                Could not load the log. It may have expired, or this account cannot read it.
              </span>
              <Button size="xs" variant="ghost" onClick={logQuery.refresh}>
                Retry
              </Button>
            </div>
          ) : !logQuery.isSuccess && !log ? (
            <p className="text-muted-foreground">Loading log…</p>
          ) : !log ? (
            <p className="text-muted-foreground">
              Logs are only available on {checkHostName(check.url)}.{" "}
              <Button size="xs" variant="link" onClick={() => check.url && open(check.url)}>
                Open
              </Button>
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border/60">
              <div className="flex items-center gap-1 border-b border-border/60 px-2 py-1 text-muted-foreground">
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
              </div>
              {log.text.length === 0 ? (
                <p className="px-2 py-2 text-muted-foreground">The log is empty.</p>
              ) : (
                <pre className="max-h-96 overflow-auto bg-muted/40 px-2 py-2 font-mono text-xs leading-5 whitespace-pre">
                  {log.text}
                </pre>
              )}
            </div>
          )}
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
