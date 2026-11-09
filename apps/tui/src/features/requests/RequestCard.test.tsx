import { RegistryContext } from "@effect/atom-react";
import type {
  ThreadPendingApproval,
  ThreadPendingUserInput,
} from "@t3tools/client-runtime/state/thread-requests";
import { EnvironmentId, RuntimeRequestId, ThreadId } from "@t3tools/contracts";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vite-plus/test";

import { KeyRouter } from "../../app/input.tsx";
import { appAtomRegistry } from "../../connection/runtime.ts";
import { focusAtom } from "../../state/ui.ts";
import { RequestCard } from "./RequestCard.tsx";

const approval: ThreadPendingApproval = {
  requestId: RuntimeRequestId.make("approval-1"),
  requestKind: "command",
  createdAt: "2026-11-09T00:00:00.000Z",
  detail: "rm -rf dist && vp run build",
  responseCapability: "live",
  supportsFeedback: true,
};

const questions: ThreadPendingUserInput = {
  requestId: RuntimeRequestId.make("question-1"),
  createdAt: "2026-11-09T00:00:00.000Z",
  responseCapability: "live",
  dismissible: false,
  questions: [
    {
      id: "db",
      header: "Database",
      question: "Which database?",
      multiSelect: false,
      options: [
        { label: "Postgres", description: "Relational" },
        { label: "SQLite", description: "File" },
      ],
    },
    {
      id: "extras",
      header: "Extras",
      question: "Add what?",
      multiSelect: true,
      options: [
        { label: "Tests", description: "Vitest" },
        { label: "Lint", description: "oxlint" },
        { label: "Docs", description: "README" },
      ],
    },
    {
      id: "name",
      header: "Name",
      question: "Package name?",
      multiSelect: false,
      options: [{ label: "app", description: "Default" }],
    },
  ],
};

function makeActions() {
  return {
    respondToApproval: vi.fn((..._: ReadonlyArray<unknown>) =>
      Promise.resolve<string | null>(null),
    ),
    respondToUserInput: vi.fn(() => Promise.resolve(null)),
    dismissUserInput: vi.fn(() => Promise.resolve(null)),
    defer: vi.fn(),
  };
}

function setup(input: {
  readonly approvals?: ReadonlyArray<ThreadPendingApproval>;
  readonly userInputs?: ReadonlyArray<ThreadPendingUserInput>;
  readonly canRespond?: boolean;
  readonly threadId: string;
  readonly actions?: ReturnType<typeof makeActions>;
}) {
  appAtomRegistry.set(focusAtom, "panel");
  const actions = input.actions ?? makeActions();
  const screen = render(
    <RegistryContext.Provider value={appAtomRegistry}>
      <KeyRouter bindings={[]} commands={new Map()}>
        <RequestCard
          thread={{
            environmentId: EnvironmentId.make("env"),
            threadId: ThreadId.make(input.threadId),
          }}
          requests={{ approvals: input.approvals ?? [], userInputs: input.userInputs ?? [] }}
          canRespond={input.canRespond ?? true}
          actions={actions}
          focused
          height={30}
        />
      </KeyRouter>
    </RegistryContext.Provider>,
  );
  return { screen, actions };
}

describe("RequestCard", () => {
  it("answers an approval by number, or declines it with feedback", async () => {
    const actions = makeActions();
    actions.respondToApproval.mockResolvedValueOnce("Request expired");
    const { screen } = setup({ approvals: [approval], threadId: "approve", actions });
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("rm -rf dist"));
      screen.stdin.write("2");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Request expired"));
      expect(actions.respondToApproval).toHaveBeenCalledWith(
        approval.requestId,
        "acceptForSession",
      );

      screen.stdin.write("f");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("feedback ›"));
      screen.stdin.write("use vp clean");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("use vp clean"));
      screen.stdin.write("\r");
      await vi.waitFor(() =>
        expect(actions.respondToApproval).toHaveBeenLastCalledWith(
          approval.requestId,
          "decline",
          "use vp clean",
        ),
      );

      screen.stdin.write("\u001b");
      await vi.waitFor(() => expect(screen.lastFrame()).not.toContain("feedback ›"));
      screen.stdin.write("\u001b");
      await vi.waitFor(() => expect(actions.defer).toHaveBeenCalledOnce());
    } finally {
      screen.unmount();
    }
  });

  it("answers a request once, even when its card remounts while the answer is in flight", async () => {
    const remount = { ...approval, requestId: RuntimeRequestId.make("approval-remount") };
    const actions = makeActions();
    let finish = (_: string | null) => {};
    actions.respondToApproval.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const first = setup({ approvals: [remount], threadId: "remount", actions });
    try {
      await vi.waitFor(() => expect(first.screen.lastFrame()).toContain("rm -rf dist"));
      first.screen.stdin.write("1");
      await vi.waitFor(() => expect(first.screen.lastFrame()).toContain("Sending"));
    } finally {
      first.screen.unmount();
    }
    const second = setup({ approvals: [remount], threadId: "remount", actions });
    try {
      await vi.waitFor(() => expect(second.screen.lastFrame()).toContain("Sending"));
      second.screen.stdin.write("1");
      finish(null);
      await vi.waitFor(() => expect(second.screen.lastFrame()).not.toContain("Sending"));
      second.screen.stdin.write("1");
      second.screen.stdin.write("\u001b");
      await vi.waitFor(() => expect(actions.defer).toHaveBeenCalledOnce());
      expect(actions.respondToApproval).toHaveBeenCalledOnce();
    } finally {
      second.screen.unmount();
    }
  });

  it("walks a multi-question flow with single, multi and Other answers", async () => {
    const { screen, actions } = setup({ userInputs: [questions], threadId: "questions" });
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Question 1/3"));
      screen.stdin.write("2");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("(•) SQLite"));
      screen.stdin.write("\r");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Question 2/3"));

      screen.stdin.write("1");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("[x] Tests"));
      screen.stdin.write("\u001b[B");
      screen.stdin.write("\u001b[B");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("[x] Tests"));
      screen.stdin.write(" ");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("[x] Docs"));
      screen.stdin.write("\r");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Question 3/3"));

      screen.stdin.write("o");
      screen.stdin.write("my-app");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Other: my-app"));
      screen.stdin.write("\r");
      await vi.waitFor(() =>
        expect(actions.respondToUserInput).toHaveBeenCalledWith(questions.requestId, {
          db: "SQLite",
          extras: ["Tests", "Docs"],
          name: "my-app",
        }),
      );
    } finally {
      screen.unmount();
    }
  });

  it("does not answer without the operate scope", async () => {
    const { screen, actions } = setup({
      approvals: [approval],
      canRespond: false,
      threadId: "read-only",
    });
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("cannot answer"));
      screen.stdin.write("1");
      screen.stdin.write("f");
      screen.stdin.write("\u001b");
      await vi.waitFor(() => expect(actions.defer).toHaveBeenCalledOnce());
      expect(actions.respondToApproval).not.toHaveBeenCalled();
    } finally {
      screen.unmount();
    }
  });
});
