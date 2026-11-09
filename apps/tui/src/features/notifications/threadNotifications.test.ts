import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  RunId,
  RuntimeRequestId,
  ThreadId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import {
  BELL,
  createThreadNotifier,
  deliverNotification,
  desktopNotificationSequence,
  parseNotificationSettings,
  type ThreadNotification,
} from "./threadNotifications.ts";

const environmentId = EnvironmentId.make("environment-1");
const at = (time: string) => DateTime.makeUnsafe(`2026-11-09T${time}Z`);
const instance = ProviderInstanceId.make("codex");

function shell(
  id: string,
  overrides: Partial<OrchestrationV2ThreadShell> = {},
): OrchestrationV2ThreadShell {
  const threadId = ThreadId.make(id);
  return {
    id: threadId,
    projectId: ProjectId.make("project-1"),
    title: `Thread ${id}`,
    providerInstanceId: instance,
    modelSelection: { instanceId: instance, model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    activeProviderThreadId: null,
    lineage: { rootThreadId: threadId, parentThreadId: null, relationshipToParent: null },
    forkedFrom: null,
    createdBy: "user",
    creationSource: "web",
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    itemCount: 0,
    visibleItemCount: 0,
    createdAt: at("10:00:00"),
    updatedAt: at("10:00:00"),
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const run = RunId.make("run-1");
const running = { latestRunId: run, activeRunId: run, status: "running" } as const;
const completed = (time: string) =>
  ({ latestRunId: run, status: "completed", latestRunCompletedAt: at(time) }) as const;
const approval = {
  ...running,
  pendingRuntimeRequest: {
    id: RuntimeRequestId.make("request-1"),
    kind: "command",
    createdAt: at("10:01:00"),
  },
} as const;

function harness() {
  const seen: ThreadNotification[] = [];
  const notifier = createThreadNotifier((notification) => seen.push(notification));
  return {
    seen,
    observe: (...threads: OrchestrationV2ThreadShell[]) => notifier.observe(environmentId, threads),
  };
}

describe("createThreadNotifier", () => {
  it("treats the first snapshot as the baseline", () => {
    const { seen, observe } = harness();
    observe(shell("a", approval), shell("b", completed("10:05:00")));
    // Fresh objects with the same state: still nothing new.
    observe(shell("a", approval), shell("b", completed("10:05:00")));
    expect(seen).toEqual([]);
  });

  it("notifies once per completion, approval and failure", () => {
    const { seen, observe } = harness();
    observe(shell("a", running), shell("b", running), shell("c", running));
    observe(
      shell("a", completed("10:05:00")),
      shell("b", approval),
      shell("c", { ...running, status: "failed" }),
    );
    observe(
      shell("a", completed("10:05:00")),
      shell("b", approval),
      shell("c", { ...running, status: "failed" }),
    );
    expect(seen.map((n) => [n.ref.threadId, n.kind, n.title])).toEqual([
      ["a", "completion", "Thread completed"],
      ["b", "input", "Approval needed"],
      ["c", "input", "Thread failed"],
    ]);
    expect(seen[0]?.threadTitle).toBe("Thread a");
  });

  it("notifies a later run of the same thread again", () => {
    const { seen, observe } = harness();
    observe(shell("a", completed("10:05:00")));
    observe(shell("a", running));
    observe(shell("a", completed("10:09:00")));
    expect(seen.map((n) => n.kind)).toEqual(["completion"]);
  });

  it("stays quiet for stopped runs, archived threads and subagents", () => {
    const { seen, observe } = harness();
    const subagent = {
      lineage: {
        rootThreadId: ThreadId.make("root"),
        parentThreadId: ThreadId.make("root"),
        relationshipToParent: "subagent",
      },
    } as const;
    observe(shell("a", running), shell("b", running), shell("c", { ...running, ...subagent }));
    observe(
      shell("a", { ...completed("10:05:00"), latestRunStopRequested: true }),
      shell("b", { ...approval, archivedAt: at("10:04:00") }),
      shell("c", { ...approval, ...subagent }),
    );
    expect(seen).toEqual([]);
  });
});

const notification: ThreadNotification = {
  ref: { environmentId, threadId: ThreadId.make("a") },
  kind: "completion",
  status: "ready",
  title: "Thread completed",
  threadTitle: "Fix login",
};
const settings = { bell: true, desktop: true, toast: true };

describe("deliverNotification", () => {
  it("routes by view and terminal focus", () => {
    const deliver = (inView: boolean, focused: boolean) =>
      deliverNotification(notification, { inView, focused, settings, protocol: "osc777" });

    expect(deliver(true, true)).toEqual({ write: "", toast: null });
    expect(deliver(false, true)).toEqual({
      write: BELL,
      toast: expect.objectContaining({ text: "Thread completed: Fix login", tone: "success" }),
    });
    expect(deliver(true, false)).toEqual({
      write: `${BELL}\u001b]777;notify;Thread completed;Fix login\u0007`,
      toast: null,
    });
  });

  it("writes nothing the settings turn off", () => {
    expect(
      deliverNotification(notification, {
        inView: false,
        focused: false,
        settings: parseNotificationSettings('{"desktop":false,"toast":false}'),
        protocol: "osc9",
      }),
    ).toEqual({ write: "", toast: null });
  });
});

describe("desktopNotificationSequence", () => {
  it("strips control bytes so a title cannot end the sequence", () => {
    expect(desktopNotificationSequence("osc9", "Input needed", "a\u0007b\u001b]c")).toBe(
      "\u001b]9;Input needed: a b ]c\u0007",
    );
    expect(desktopNotificationSequence("osc777", "x;y", "a;b")).toBe(
      "\u001b]777;notify;x,y;a;b\u0007",
    );
  });
});

describe("parseNotificationSettings", () => {
  it("falls back to defaults for a missing or broken file", () => {
    const defaults = { bell: false, desktop: true, toast: true };
    expect(parseNotificationSettings(null)).toEqual(defaults);
    expect(parseNotificationSettings("{not json")).toEqual(defaults);
    expect(parseNotificationSettings('{"bell":true}')).toEqual({ ...defaults, bell: true });
  });
});
