import { RegistryContext } from "@effect/atom-react";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vite-plus/test";

import { appAtomRegistry } from "../../connection/runtime.ts";
import { PaneContext } from "../../state/panes.ts";
import { routeAtom } from "../../state/ui.ts";
import { ChangesView } from "./ChangesView.tsx";

const thread = { environmentId: EnvironmentId.make("env-test"), threadId: ThreadId.make("a") };

describe("ChangesView", () => {
  it("shows its own pane's thread, not the focused pane's", async () => {
    appAtomRegistry.set(routeAtom, { view: "home", thread: null });
    const screen = render(
      <RegistryContext.Provider value={appAtomRegistry}>
        <PaneContext.Provider value={{ route: { view: "changes", thread }, active: false }}>
          <ChangesView focused={false} width={60} height={5} />
        </PaneContext.Provider>
      </RegistryContext.Provider>,
    );
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Loading thread"));
    } finally {
      screen.unmount();
    }
  });
});
