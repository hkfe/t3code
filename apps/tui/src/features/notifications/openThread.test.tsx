import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vite-plus/test";

import { App } from "../../app/App.tsx";
import { appAtomRegistry } from "../../connection/runtime.ts";
import { toastAtom } from "../../state/toast.ts";
import { routeAtom } from "../../state/ui.ts";
import { features } from "../index.ts";

describe("notifications.openThread", () => {
  it("opens the toast's thread on ctrl+y and hides the toast", async () => {
    vi.stubEnv("T3_TUI_CONFIG_DIR", "/nonexistent/t3-tui-notifications-test");
    const thread = { environmentId: EnvironmentId.make("env"), threadId: ThreadId.make("t1") };
    const screen = render(<App registry={appAtomRegistry} features={features} />);
    try {
      appAtomRegistry.set(toastAtom, { text: "Thread failed: Fix", tone: "danger", thread });
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Thread failed: Fix"));
      screen.stdin.write("\u0019");
      await vi.waitFor(() => expect(appAtomRegistry.get(routeAtom).thread).toEqual(thread));
      expect(appAtomRegistry.get(toastAtom)).toBeNull();
    } finally {
      screen.unmount();
      vi.unstubAllEnvs();
    }
  });
});
