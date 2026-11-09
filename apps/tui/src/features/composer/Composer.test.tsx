import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vite-plus/test";

import { App } from "../../app/App.tsx";
import { appAtomRegistry } from "../../connection/runtime.ts";
import { composerReplyTargetAtom } from "../../state/composer.ts";
import { focusAtom, routeAtom } from "../../state/ui.ts";
import { coreFeature } from "../core/index.tsx";
import { composerFeature } from "./index.ts";
import { composerDraftAtom, threadKey } from "./state.ts";

const thread = {
  environmentId: EnvironmentId.make("env-test"),
  threadId: ThreadId.make("thread-test"),
};

describe("Composer", () => {
  it("edits across lines, clears the reply chip on escape, then hands keys to the view", async () => {
    vi.stubEnv("T3_TUI_CONFIG_DIR", "/nonexistent/t3-tui-composer-test");
    const registry = appAtomRegistry;
    registry.set(routeAtom, { view: "thread", thread });
    registry.set(focusAtom, "main");
    registry.set(composerReplyTargetAtom, {
      thread,
      messageId: MessageId.make("message-1"),
      role: "assistant",
      text: "Use the\nnew API",
    });
    const screen = render(<App registry={registry} features={[coreFeature, composerFeature]} />);
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Replying to T3 Code"));
      screen.stdin.write("helo");
      screen.stdin.write("\u001B[D");
      screen.stdin.write("l");
      screen.stdin.write("\u0005"); // ctrl+e, end of line
      screen.stdin.write("\n"); // ctrl+j, newline
      screen.stdin.write("world");
      await vi.waitFor(() =>
        expect(registry.get(composerDraftAtom(threadKey(thread))).editor).toEqual({
          text: "hello\nworld",
          cursor: 11,
        }),
      );
      expect(screen.lastFrame()).toContain("hello");

      screen.stdin.write("\u001B");
      await vi.waitFor(() => expect(registry.get(composerReplyTargetAtom)).toBeNull());
      screen.stdin.write("\u001B");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("enter or i to type"));
      screen.stdin.write("x");
      expect(registry.get(composerDraftAtom(threadKey(thread))).editor.text).toBe("hello\nworld");
    } finally {
      screen.unmount();
      vi.unstubAllEnvs();
    }
  });
});
