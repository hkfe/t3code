import {
  capitalizeTerm,
  sourceControlClients,
} from "@t3tools/client-runtime/source-control-clients";
import { useAtomCommand } from "~/state/use-atom-command";
import type {
  EnvironmentId,
  PullRequestActor,
  PullRequestCheck,
  PullRequestComment,
  PullRequestDetailView,
  PullRequestRef,
  ScopedThreadRef,
} from "@t3tools/contracts";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  FileCode2Icon,
  GitCommitHorizontalIcon,
  MessageSquareCodeIcon,
  MessageSquareIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { pullRequestEnvironment } from "~/state/pullRequests";
import { RelativeTime } from "~/components/RelativeTime";

import { Button } from "../ui/button";
import { PullRequestEditButton } from "./PullRequestEditButton";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  buildPullRequestTimeline,
  buildPullRequestTimelineRows,
  groupPullRequestChecks,
  pullRequestSyncCommitSource,
  pullRequestTimelineDayLabel,
  type PullRequestTimelineRow,
  isPullRequestVerdictStale,
  newestPullRequestCommitAt,
  pullRequestReviewOutcome,
  type PullRequestReviewOutcome,
  type PullRequestTimelineEvent,
  type PullRequestTimelineThread,
} from "./pullRequestDetail.logic";
import { canEditPullRequestComment } from "@t3tools/client-runtime/pull-request-editing";
import { PullRequestMarkdown } from "./PullRequestMarkdown";
import { PullRequestMoreReplies } from "./PullRequestMoreReplies";
import { PullRequestMarkdownEditor } from "./PullRequestMarkdownEditor";
import { PullRequestReactionBar } from "./PullRequestReactions";
import {
  PullRequestActorAvatar,
  PullRequestDiffStat,
  PullRequestMetaLine,
  PullRequestReviewOutcomeIcon,
  PullRequestSectionLabel,
  pullRequestChecksState,
  pullRequestChecksStatePresentation,
  summarizePullRequestChecks,
  pullRequestReviewOutcomeLabel,
  pullRequestReviewOutcomeStaleLabel,
  pullRequestReviewOutcomeToneClassName,
} from "./pullRequestPresentation";
import {
  PULL_REQUEST_STATE_PRESENTATION,
  PullRequestGlyph,
  type PullRequestStatePresentation,
} from "./pullRequestIcons";
import { LegendList, type LegendListRef } from "@legendapp/list/react";

interface ReactionSurface {
  readonly canReact: boolean;
  readonly environmentId: EnvironmentId;
  readonly threadRef: ScopedThreadRef | null;
  readonly reference: PullRequestRef;
  readonly onRefresh: () => void;
}

function TimelineBody({
  body,
  markdown,
  cwd,
  environmentId,
  threadRef,
}: {
  body: string;
  markdown: boolean;
  cwd: string;
  environmentId: EnvironmentId;
  threadRef: ScopedThreadRef | null;
}) {
  return (
    <div className="mt-3">
      {markdown ? (
        <PullRequestMarkdown
          text={body}
          cwd={cwd}
          environmentId={environmentId}
          threadRef={threadRef}
        />
      ) : (
        <p className="whitespace-pre-wrap text-xs text-muted-foreground">{body}</p>
      )}
    </div>
  );
}

function ActorName({ actor }: { actor: PullRequestActor | null }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold text-foreground">
      <PullRequestActorAvatar actor={actor} className="size-4" />
      <span className="truncate">{actor?.login ?? "ghost"}</span>
    </span>
  );
}

const MARKER_TONE = {
  neutral: "border-border/70 text-muted-foreground",
  muted: "border-border/50 text-muted-foreground/70",
  info: "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300/90",
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300/90",
  merged: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300/90",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;
type MarkerTone = keyof typeof MARKER_TONE;

// Each row draws its own slice of the connector, so the line stops at the last marker.
function markerSitsAtTop(row: PullRequestTimelineRow): boolean {
  if (row.kind === "comments") return true;
  if (row.kind === "day" || row.kind === "sync" || row.kind === "commits") return false;
  return row.event.thread !== undefined || pullRequestReviewOutcome(row.event.reviewState) !== null;
}

function TimelineMarker({
  children,
  tone,
  small = false,
  className,
}: {
  children: ReactNode;
  tone: MarkerTone;
  small?: boolean;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute left-0 top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center",
        className,
      )}
    >
      <span className="flex items-center justify-center rounded-full bg-background">
        <span
          className={cn(
            "flex items-center justify-center rounded-full border",
            small ? "size-5 [&>svg]:size-3" : "size-7 [&>svg]:size-3.5",
            MARKER_TONE[tone],
          )}
        >
          {children}
        </span>
      </span>
    </span>
  );
}

function StackedAvatars({ actors }: { actors: ReadonlyArray<PullRequestActor> }) {
  return (
    <span className="inline-flex shrink-0 -space-x-1">
      {actors.slice(0, 3).map((actor) => (
        <PullRequestActorAvatar
          key={actor.login}
          actor={actor}
          className="size-4 ring-2 ring-background"
        />
      ))}
    </span>
  );
}

function friendlyReviewState(value: string): string {
  const words = value.toLowerCase().replaceAll("_", " ").replaceAll("-", " ");
  return words.replace(/^\w/u, (letter) => letter.toUpperCase());
}

function ReviewStateBadge({ state }: { state: string }) {
  return (
    <span className="text-3xs font-medium text-muted-foreground">{friendlyReviewState(state)}</span>
  );
}

function OpenOnHostButton({ url, onOpen }: { url: string | null; onOpen: (url: string) => void }) {
  return url === null ? null : (
    <Button
      size="icon-xs"
      variant="ghost-muted"
      className="-mr-1 shrink-0"
      aria-label="Open activity on host"
      onClick={() => onOpen(url)}
    >
      <ExternalLinkIcon className="size-3" />
    </Button>
  );
}

function ConversationCard({
  event,
  editable,
  cwd,
  onOpen,
  reactions,
  showPath = true,
}: {
  event: PullRequestTimelineEvent;
  editable: PullRequestComment | null;
  cwd: string;
  onOpen: (url: string) => void;
  reactions: ReactionSurface;
  showPath?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const updateComment = useAtomCommand(pullRequestEnvironment.updateComment, {
    reportFailure: false,
  });

  const save = async (body: string) => {
    if (editable === null || saving || editable.kind === "review") return;
    setSaving(true);
    const result = await updateComment({
      environmentId: reactions.environmentId,
      input: { ...reactions.reference, commentId: editable.id, kind: editable.kind, body },
    });
    setSaving(false);
    if (result._tag === "Failure") {
      toastManager.add({ type: "error", title: "Could not save the comment" });
      return;
    }
    setEditing(false);
    reactions.onRefresh();
  };

  return (
    <article className="group py-2">
      <div className="px-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
              <ActorName actor={event.actor} />
              <span className="text-muted-foreground">{event.title}</span>
              {event.reviewState ? <ReviewStateBadge state={event.reviewState} /> : null}
            </div>
            <PullRequestMetaLine className="mt-1 flex-wrap text-2xs text-muted-foreground">
              <span>
                <RelativeTime timestamp={event.at} />
              </span>
              {showPath && event.path ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileCode2Icon aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{event.path}</span>
                </span>
              ) : null}
            </PullRequestMetaLine>
          </div>
          {editable !== null && !editing ? (
            <PullRequestEditButton aria-label="Edit comment" onClick={() => setEditing(true)} />
          ) : null}
          {reactions.canReact || event.reactions.length > 0 ? (
            <PullRequestReactionBar
              className="ml-auto justify-end"
              reactions={event.reactions}
              canReact={reactions.canReact}
              subjectId={event.id}
              environmentId={reactions.environmentId}
              reference={reactions.reference}
              onRefresh={reactions.onRefresh}
            />
          ) : null}
          <OpenOnHostButton url={event.url} onOpen={onOpen} />
        </div>
      </div>
      {editing && editable !== null ? (
        <div className="px-2 pb-2 pt-3">
          <PullRequestMarkdownEditor
            value={editable.body}
            cwd={cwd}
            environmentId={reactions.environmentId}
            threadRef={reactions.threadRef}
            label="Edit comment"
            saving={saving}
            onSave={(body) => void save(body)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : event.body ? (
        <div className="px-2 pb-2">
          <TimelineBody
            body={event.body}
            markdown={event.markdown}
            cwd={cwd}
            environmentId={reactions.environmentId}
            threadRef={reactions.threadRef}
          />
        </div>
      ) : null}
    </article>
  );
}

function uniqueConversationActors(events: ReadonlyArray<PullRequestTimelineEvent>) {
  const actors = new Map<string, PullRequestActor>();
  for (const event of events) {
    const actor = event.actor;
    if (actor !== null && !actors.has(actor.login)) actors.set(actor.login, actor);
  }
  return [...actors.values()];
}

function ConversationGroup({
  events,
  editable,
  cwd,
  onOpen,
  reactions,
}: {
  events: ReadonlyArray<PullRequestTimelineEvent>;
  editable: ReadonlyMap<string, PullRequestComment>;
  cwd: string;
  onOpen: (url: string) => void;
  reactions: ReactionSurface;
}) {
  const [open, setOpen] = useState(false);
  const actors = uniqueConversationActors(events);
  const first = events[0];
  if (first === undefined) return null;

  return (
    <div className="relative mb-3 pl-12 [contain-intrinsic-block-size:48px] [content-visibility:auto]">
      <TimelineMarker tone="info" className="top-6">
        <MessageSquareIcon />
      </TimelineMarker>
      <Collapsible open={open} onOpenChange={setOpen}>
        <div>
          <CollapsibleTrigger className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left text-foreground hover:bg-accent/50">
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">
                {events.length.toLocaleString()} {events.length === 1 ? "comment" : "comments"}
              </span>
              <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
                <StackedAvatars actors={actors} />
                <span className="truncate">
                  {actors.map((actor) => actor.login).join(", ")} ·{" "}
                  <RelativeTime timestamp={first.at} />
                </span>
              </span>
            </span>
            <ChevronDownIcon
              aria-hidden
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          <CollapsiblePanel>
            {open ? (
              <div className="mt-1 space-y-1">
                {events.map((event) => (
                  <ConversationCard
                    // Host comment ids can collide across pull requests.
                    key={`${reactions.reference.projectId}#${reactions.reference.number}:${event.id}`}
                    event={event}
                    editable={editable.get(event.id) ?? null}
                    cwd={cwd}
                    onOpen={onOpen}
                    reactions={reactions}
                  />
                ))}
              </div>
            ) : null}
          </CollapsiblePanel>
        </div>
      </Collapsible>
    </div>
  );
}

function ReviewThreadEvent({
  event,
  thread,
  editable,
  cwd,
  onOpen,
  reactions,
}: {
  event: PullRequestTimelineEvent;
  thread: PullRequestTimelineThread;
  editable: ReadonlyMap<string, PullRequestComment>;
  cwd: string;
  onOpen: (url: string) => void;
  reactions: ReactionSurface;
}) {
  const dismissed = pullRequestReviewOutcome(event.reviewState) === "dismissed";
  const [expanded, setExpanded] = useState(!thread.isResolved && !dismissed);
  const replyCount = thread.replies.length + thread.moreReplies;

  return (
    <div className="group relative mb-3 pl-12 [contain-intrinsic-block-size:48px] [content-visibility:auto]">
      <TimelineMarker tone={thread.isResolved || dismissed ? "neutral" : "info"} className="top-6">
        <MessageSquareCodeIcon />
      </TimelineMarker>
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-2 px-2 py-2 text-left text-2xs text-muted-foreground hover:text-foreground"
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <FileCode2Icon aria-hidden className="size-3 shrink-0" />
        <span className="min-w-0 truncate font-mono">
          {thread.line === null ? thread.path : `${thread.path}:${thread.line}`}
        </span>
        {thread.isResolved ? (
          <span className="inline-flex shrink-0 items-center gap-1 font-medium text-success-foreground">
            <CircleCheckIcon aria-hidden className="size-3" />
            Resolved
          </span>
        ) : null}
        {dismissed ? <span className="shrink-0 font-medium">Review dismissed</span> : null}
        {thread.isOutdated ? <span className="shrink-0 font-medium">Outdated</span> : null}
        {expanded ? null : (
          <span className="shrink-0">
            · {event.actor?.login ?? "ghost"}
            {replyCount > 0 ? (
              <>
                {" "}
                · {replyCount.toLocaleString()} {replyCount === 1 ? "reply" : "replies"}
              </>
            ) : null}
          </span>
        )}
        <ChevronDownIcon
          aria-hidden
          className={cn("ml-auto size-3.5 shrink-0 transition-transform", expanded && "rotate-180")}
        />
      </button>
      {expanded ? (
        <>
          <ConversationCard
            event={event}
            editable={editable.get(event.id) ?? null}
            cwd={cwd}
            onOpen={onOpen}
            reactions={reactions}
            showPath={false}
          />
          {thread.replies.length > 0 ? (
            <div className="ml-2 space-y-1 border-l border-border/60 pl-3">
              {thread.replies.map((reply) => (
                <ConversationCard
                  key={reply.id}
                  event={reply}
                  editable={editable.get(reply.id) ?? null}
                  cwd={cwd}
                  onOpen={onOpen}
                  reactions={reactions}
                  showPath={false}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
      {thread.hasMoreReplies ? (
        <div className="px-2">
          <PullRequestMoreReplies {...thread} />
        </div>
      ) : null}
    </div>
  );
}

function CommitEvent({
  event,
  onOpen,
}: {
  event: PullRequestTimelineEvent;
  onOpen: (oid: string) => void;
}) {
  return (
    <button
      type="button"
      className="group relative mb-3 block w-full cursor-pointer rounded-md pl-12 text-left outline-none [contain-intrinsic-block-size:44px] [content-visibility:auto] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`View commit ${event.id}`}
      onClick={() => onOpen(event.id)}
    >
      <TimelineMarker tone="neutral">
        <GitCommitHorizontalIcon />
      </TimelineMarker>
      <div className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 group-hover:bg-accent/50">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">
            {event.body ?? "Untitled commit"}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            {event.commitAuthors.length > 0 ? (
              <>
                <StackedAvatars actors={event.commitAuthors} />
                <span className="truncate">{event.commitAuthors[0]?.login}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <code className="font-mono">{event.id.slice(0, 7)}</code>
            <span aria-hidden>·</span>
            <span className="shrink-0">
              <RelativeTime timestamp={event.at} />
            </span>
          </div>
        </div>
        {event.additions !== null && event.deletions !== null ? (
          <PullRequestDiffStat
            additions={event.additions}
            deletions={event.deletions}
            className="ml-auto shrink-0 font-mono text-2xs"
          />
        ) : null}
      </div>
    </button>
  );
}

function SyncCommitEvent({
  events,
  onOpen,
}: {
  events: ReadonlyArray<PullRequestTimelineEvent>;
  onOpen: (oid: string) => void;
}) {
  const first = events[0];
  if (first === undefined) return null;
  return (
    <button
      type="button"
      className="group relative mb-3 flex w-full cursor-pointer items-center gap-1.5 rounded-md py-1 pl-14 pr-2 text-left text-2xs text-muted-foreground outline-none [contain-intrinsic-block-size:28px] [content-visibility:auto] hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      aria-label={`View commit ${first.id}`}
      onClick={() => onOpen(first.id)}
    >
      <TimelineMarker tone="muted" small>
        <PullRequestGlyph.merged />
      </TimelineMarker>
      <span className="min-w-0 truncate">
        Merged <code className="font-mono">{pullRequestSyncCommitSource(first)}</code> into this
        branch
      </span>
      {events.length > 1 ? (
        <span className="shrink-0 rounded-full bg-muted px-1.5 font-medium tabular-nums">
          {events.length}×
        </span>
      ) : null}
      <span aria-hidden>·</span>
      <code className="shrink-0 font-mono">{first.id.slice(0, 7)}</code>
      <span aria-hidden>·</span>
      <span className="shrink-0">
        <RelativeTime timestamp={first.at} />
      </span>
    </button>
  );
}

function CommitRunEvent({
  events,
  expanded,
  onToggle,
}: {
  events: ReadonlyArray<PullRequestTimelineEvent>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const authors = new Map<string, PullRequestActor>();
  for (const author of events.flatMap((event) => event.commitAuthors)) {
    if (!authors.has(author.login)) authors.set(author.login, author);
  }
  const syncs = events.filter((event) => pullRequestSyncCommitSource(event) !== null).length;
  const additions = events.reduce((sum, event) => sum + (event.additions ?? 0), 0);
  const deletions = events.reduce((sum, event) => sum + (event.deletions ?? 0), 0);
  const latest = events.reduce((a, b) => (Date.parse(b.at) > Date.parse(a.at) ? b : a));
  return (
    <button
      type="button"
      aria-expanded={expanded}
      className="group relative mb-3 block w-full cursor-pointer rounded-md pl-12 text-left outline-none [contain-intrinsic-block-size:44px] [content-visibility:auto] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={onToggle}
    >
      <TimelineMarker tone="neutral">
        <GitCommitHorizontalIcon />
      </TimelineMarker>
      <div className="flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 group-hover:bg-accent/50">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">
            {events.length.toLocaleString()} commits
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-2xs text-muted-foreground">
            {authors.size > 0 ? <StackedAvatars actors={[...authors.values()]} /> : null}
            <span className="truncate">
              {[...authors.keys()].join(", ")}
              {authors.size > 0 ? " · " : ""}
              {syncs > 0 ? `${syncs} ${syncs === 1 ? "sync" : "syncs"} · ` : ""}
              <RelativeTime timestamp={latest.at} />
            </span>
          </div>
        </div>
        <PullRequestDiffStat
          additions={additions}
          deletions={deletions}
          className="shrink-0 font-mono text-2xs"
        />
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-180",
          )}
        />
      </div>
    </button>
  );
}

function DayDivider({ at }: { at: string }) {
  return (
    <div className="mb-3 flex h-8 items-center [contain-intrinsic-block-size:32px] [content-visibility:auto]">
      <PullRequestSectionLabel>{pullRequestTimelineDayLabel(at)}</PullRequestSectionLabel>
    </div>
  );
}

function LifecycleEvent({ event, term }: { event: PullRequestTimelineEvent; term: string }) {
  const presentation: { state: PullRequestStatePresentation; tone: MarkerTone; verb: string } =
    event.kind === "opened"
      ? { state: PULL_REQUEST_STATE_PRESENTATION.open, tone: "success", verb: "opened" }
      : event.kind === "merged"
        ? { state: PULL_REQUEST_STATE_PRESENTATION.merged, tone: "merged", verb: "merged" }
        : { state: PULL_REQUEST_STATE_PRESENTATION.closed, tone: "danger", verb: "closed" };

  return (
    <div className="relative mb-3 pl-12 [contain-intrinsic-block-size:44px] [content-visibility:auto]">
      <TimelineMarker tone={presentation.tone}>
        <presentation.state.Icon />
      </TimelineMarker>
      <div className="px-2 py-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          {event.actor ? <ActorName actor={event.actor} /> : null}
          <span className={cn("font-semibold", presentation.state.toneClassName)}>
            {event.actor
              ? `${presentation.verb} this ${term}`
              : `${capitalizeTerm(term)} ${presentation.verb}`}
          </span>
        </div>
        <div className="mt-0.5 text-2xs text-muted-foreground">
          <RelativeTime timestamp={event.at} />
        </div>
      </div>
    </div>
  );
}

function ChecksSummary({
  checks,
  onShowChecks,
}: {
  checks: ReadonlyArray<PullRequestCheck>;
  onShowChecks: () => void;
}) {
  const state = pullRequestChecksState(checks);
  const presentation = state === null ? null : pullRequestChecksStatePresentation(state);
  const { attention, running, completed } = groupPullRequestChecks(checks);
  return (
    <button
      type="button"
      className="relative z-10 mb-5 flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 text-left outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onClick={onShowChecks}
    >
      {presentation ? (
        <presentation.Icon
          aria-hidden
          className={cn("size-4 shrink-0", presentation.toneClassName)}
        />
      ) : (
        <CircleCheckIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-semibold text-foreground">
          {summarizePullRequestChecks(checks)}
        </span>
        <span className="block truncate text-2xs text-muted-foreground">
          {[
            attention.length > 0 ? `${attention.length} need attention` : null,
            running.length > 0 ? `${running.length} running` : null,
            // "N done" only adds information next to running or failing checks.
            completed.length > 0 && attention.length + running.length > 0
              ? `${completed.length} done`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      <span className="shrink-0 text-2xs text-muted-foreground">View checks</span>
      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function ReviewVerdictEvent({
  event,
  outcome,
  stale,
  cwd,
  onOpen,
  reactions,
}: {
  event: PullRequestTimelineEvent;
  outcome: PullRequestReviewOutcome;
  stale: boolean;
  cwd: string;
  onOpen: (url: string) => void;
  reactions: ReactionSurface;
}) {
  return (
    <div className="group relative mb-3 pl-12 [contain-intrinsic-block-size:48px] [content-visibility:auto]">
      <TimelineMarker
        tone={
          outcome === "approved"
            ? "success"
            : outcome === "changes-requested"
              ? "danger"
              : "neutral"
        }
        className="top-6"
      >
        <PullRequestReviewOutcomeIcon outcome={outcome} />
      </TimelineMarker>
      <div className="flex min-w-0 flex-wrap items-center gap-2 px-2 py-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <ActorName actor={event.actor} />
            <Tooltip disabled={!stale}>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      "font-medium lowercase",
                      stale
                        ? "text-muted-foreground opacity-70"
                        : pullRequestReviewOutcomeToneClassName(outcome),
                    )}
                  />
                }
              >
                {pullRequestReviewOutcomeLabel(outcome)}
                {stale ? <span className="sr-only">, before the latest commits</span> : null}
              </TooltipTrigger>
              <TooltipPopup>{pullRequestReviewOutcomeStaleLabel(outcome)}</TooltipPopup>
            </Tooltip>
          </div>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <PullRequestMetaLine className="flex-wrap text-2xs text-muted-foreground">
              <span>
                <RelativeTime timestamp={event.at} />
              </span>
              {event.path ? (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <FileCode2Icon aria-hidden className="size-3 shrink-0" />
                  <span className="truncate">{event.path}</span>
                </span>
              ) : null}
            </PullRequestMetaLine>
          </div>
        </div>
        {reactions.canReact || event.reactions.length > 0 ? (
          <PullRequestReactionBar
            className="ml-auto justify-end"
            reactions={event.reactions}
            canReact={reactions.canReact}
            subjectId={event.id}
            environmentId={reactions.environmentId}
            reference={reactions.reference}
            onRefresh={reactions.onRefresh}
          />
        ) : null}
        <OpenOnHostButton url={event.url} onOpen={onOpen} />
      </div>
      {event.body ? (
        <div className="px-2">
          <TimelineBody
            body={event.body}
            markdown={event.markdown}
            cwd={cwd}
            environmentId={reactions.environmentId}
            threadRef={reactions.threadRef}
          />
        </div>
      ) : null}
    </div>
  );
}

export function PullRequestTimelineTab({
  scrollerRef,
  detail,
  environmentId,
  threadRef = null,
  reference,
  order,
  onOpenCommit,
  onShowChecks,
  onRefresh,
}: {
  scrollerRef: (node: HTMLElement | null) => void;
  detail: PullRequestDetailView;
  environmentId: EnvironmentId;
  threadRef?: ScopedThreadRef | null;
  reference: PullRequestRef;
  order: "newest" | "oldest";
  onOpenCommit: (oid: string) => void;
  onShowChecks: () => void;
  onRefresh: () => void;
}) {
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<string>>(() => new Set());
  const toggleRun = (key: string) =>
    setExpandedRuns((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const events = buildPullRequestTimeline(detail);
  const term = sourceControlClients.get(detail.provider).changeRequest.singular;
  const newestCommitAt = newestPullRequestCommitAt(detail.commits);
  const reactions: ReactionSurface = {
    canReact: detail.capabilities.reactions === true,
    environmentId,
    threadRef,
    reference,
    onRefresh,
  };
  const editable = new Map(
    events
      .flatMap((event) => [event, ...(event.thread?.replies ?? [])])
      .flatMap((event) => (event.comment ? [event.comment] : []))
      .filter((comment) => canEditPullRequestComment(detail, comment))
      .map((comment) => [comment.id, comment] as const),
  );
  const orderedEvents = order === "newest" ? events : events.toReversed();
  const rows = buildPullRequestTimelineRows(orderedEvents, expandedRuns);
  const openOnHost = (url: string) => {
    void readLocalApi()?.shell.openExternal(url);
  };

  const rowKey = (row: PullRequestTimelineRow) => {
    if (row.kind === "day") return `day:${row.key}`;
    if (row.kind === "commits") return row.key;
    if (row.kind === "sync") return `sync:${row.events[0]?.id ?? "empty"}`;
    if (row.kind === "comments") return `comments:${row.events[0]?.id ?? "empty"}`;
    const event = row.event;
    // A thread's resolution or dismissal remounts it, so its disclosure starts in the new state.
    return event.thread === undefined
      ? event.id
      : `thread:${event.id}:${event.thread.isResolved}:${pullRequestReviewOutcome(event.reviewState) === "dismissed"}`;
  };
  const renderRow = ({ item: row }: { item: PullRequestTimelineRow }) => {
    if (row.kind === "day") return <DayDivider at={row.at} />;
    if (row.kind === "sync") return <SyncCommitEvent events={row.events} onOpen={onOpenCommit} />;
    if (row.kind === "commits") {
      return (
        <CommitRunEvent
          events={row.events}
          expanded={row.expanded}
          onToggle={() => toggleRun(row.key)}
        />
      );
    }
    if (row.kind === "comments") {
      return (
        <ConversationGroup
          events={row.events}
          editable={editable}
          cwd={detail.workspaceRoot}
          onOpen={openOnHost}
          reactions={reactions}
        />
      );
    }
    const event = row.event;
    if (event.thread !== undefined) {
      return (
        <ReviewThreadEvent
          event={event}
          thread={event.thread}
          editable={editable}
          cwd={detail.workspaceRoot}
          onOpen={openOnHost}
          reactions={reactions}
        />
      );
    }
    if (event.kind === "commit") return <CommitEvent event={event} onOpen={onOpenCommit} />;
    const outcome = pullRequestReviewOutcome(event.reviewState);
    if (outcome !== null) {
      return (
        <ReviewVerdictEvent
          event={event}
          outcome={outcome}
          stale={isPullRequestVerdictStale(event.at, newestCommitAt)}
          cwd={detail.workspaceRoot}
          onOpen={openOnHost}
          reactions={reactions}
        />
      );
    }
    return <LifecycleEvent event={event} term={term} />;
  };

  if (events.length === 0) {
    return (
      <div ref={scrollerRef} className="scrollbar-gutter-both h-full overflow-y-auto px-4 py-5">
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <PullRequestGlyph.pullRequest className="mb-2 size-5" />
          <p className="text-xs">No activity yet.</p>
        </div>
      </div>
    );
  }

  // Virtualized: a large pull request has thousands of events, and mounting every one stalls
  // the page. The connector line is drawn by the content container, behind the rows.
  return (
    <LegendList<PullRequestTimelineRow>
      ref={(list: LegendListRef | null) => scrollerRef(list?.getScrollableNode() ?? null)}
      data={rows}
      extraData={{ editable, reactions, newestCommitAt, expandedRuns }}
      keyExtractor={rowKey}
      renderItem={(info) => (
        <div
          className={cn(
            "relative before:absolute before:left-[15px] before:top-0 before:w-px before:bg-border/60",
            info.index === 0 && detail.checks.length === 0 && "before:top-1/2",
            info.index < rows.length - 1
              ? "before:bottom-0"
              : markerSitsAtTop(info.item)
                ? "before:h-6"
                : "before:h-1/2",
          )}
        >
          {renderRow(info)}
        </div>
      )}
      estimatedItemSize={56}
      className="scrollbar-gutter-both h-full px-4"
      contentContainerClassName="mx-auto w-full max-w-3xl"
      ListHeaderComponent={
        <div className="pt-5">
          {detail.checks.length > 0 ? (
            <div className="relative flow-root before:absolute before:bottom-0 before:left-[15px] before:top-1/2 before:w-px before:bg-border/60">
              <ChecksSummary checks={detail.checks} onShowChecks={onShowChecks} />
            </div>
          ) : null}
        </div>
      }
      ListFooterComponent={<div className="h-5" />}
    />
  );
}
