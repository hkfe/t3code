import {
  CommandId,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadShell,
  type RunId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { EMPTY_EDITOR } from "./editor.ts";
import { buildTurnInput, type NewThreadSend } from "./send.ts";
import { EMPTY_DRAFT, type ComposerDraft } from "./state.ts";

const threadId = ThreadId.make("thread-1");
const idle = {
  id: threadId,
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt" },
  runtimeMode: "full-access",
  interactionMode: "plan",
  activeRunId: null,
  activityRunStatus: null,
} as unknown as OrchestrationV2ThreadShell;
const running = { ...idle, activeRunId: "run-1" as RunId, activityRunStatus: "running" } as const;

function build(
  text: string,
  options: {
    thread?: OrchestrationV2ThreadShell;
    alternate?: boolean;
    reply?: boolean;
    draft?: Partial<ComposerDraft>;
    provider?: Partial<ServerProvider>;
    newThread?: NewThreadSend;
  } = {},
) {
  return buildTurnInput({
    thread: options.thread ?? idle,
    ...(options.newThread && { newThread: options.newThread }),
    draft: { ...EMPTY_DRAFT, editor: { text, cursor: text.length }, ...options.draft },
    reply: options.reply
      ? {
          thread: { environmentId: EnvironmentId.make("env-1"), threadId },
          messageId: MessageId.make("message-0"),
          role: "assistant",
          text: "Earlier answer",
        }
      : null,
    provider: options.provider as ServerProvider | undefined,
    alternate: options.alternate ?? false,
    messageId: MessageId.make("message-1"),
    commandId: CommandId.make("command-1"),
    createdAt: "2026-11-09T00:00:00.000Z",
  });
}

describe("buildTurnInput", () => {
  it("starts when idle, steers a running turn, and queues on the alternate key or during setup", () => {
    expect(build("hi")?.input.dispatchMode).toBe("auto");
    expect(build("hi", { thread: running })?.input.dispatchMode).toBe("steer");
    expect(build("hi", { thread: running, alternate: true })?.input.dispatchMode).toBe("queue");
    const preparing = { ...running, activityRunStatus: "preparing" } as const;
    expect(build("hi", { thread: preparing })?.input.dispatchMode).toBe("queue");
  });

  it("sends nothing for blank text, and the bootstrap prompt for an image alone", () => {
    expect(build("  \n ")).toBeNull();
    const image = {
      type: "image",
      name: "a.png",
      mimeType: "image/png",
      sizeBytes: 1,
      dataUrl: "data:,",
    } as const;
    const sent = build("", { draft: { editor: EMPTY_EDITOR, attachments: [image] }, reply: true });
    expect(sent?.sentReply).toBe(false);
    expect(sent?.input.message.attachments).toEqual([image]);
    expect(sent?.input.message.text).toContain("without additional text");
  });

  it("leads the text with the reply chip and sends its record as context", () => {
    const sent = build(" thanks ", { reply: true });
    expect(sent?.sentReply).toBe(true);
    const record = sent?.input.message.context?.records[0];
    expect(record).toMatchObject({ kind: "reply", messageId: "message-0", text: "Earlier answer" });
    expect(sent?.input.message.text).toMatch(
      /^\[Reply to T3 Code\]\(t3-context:\/\/v1\/reply\/.+\)\n\nthanks$/,
    );
  });

  it("sends draft settings over the thread's, and drops plan mode for providers without it", () => {
    const sent = build("hi", { draft: { runtimeMode: "approval-required" } });
    expect(sent?.input).toMatchObject({
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
    expect(
      build("hi", { provider: { showInteractionModeToggle: false } })?.input.interactionMode,
    ).toBe("default");
  });

  it("creates a new thread with the first send, in a new worktree when chosen", () => {
    const projectId = ProjectId.make("project-1");
    const local = build("Fix the login", { newThread: { projectId, worktree: null } })?.input;
    expect(local?.bootstrap).toEqual({
      createThread: {
        projectId,
        title: "Fix the login",
        modelSelection: idle.modelSelection,
        runtimeMode: "full-access",
        interactionMode: "plan",
        branch: null,
        worktreePath: null,
        createdAt: "2026-11-09T00:00:00.000Z",
      },
    });
    const worktree = { projectCwd: "/work/app", baseBranch: "main" };
    expect(build("hi", { newThread: { projectId, worktree } })?.input.bootstrap).toMatchObject({
      prepareWorktree: worktree,
      runSetupScript: true,
    });
    expect(build("hi")?.input.bootstrap).toBeUndefined();
  });
});
