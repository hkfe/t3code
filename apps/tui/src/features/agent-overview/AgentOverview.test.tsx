import { RegistryContext } from "@effect/atom-react";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";
import { AtomRegistry } from "effect/reactivity";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vite-plus/test";

import { KeyRouter } from "../../app/input.tsx";
import { environmentThreadShells } from "../../state/threadShells.ts";
import { environmentThreadDetails } from "../../state/threads.ts";
import { overlayAtom, routeAtom } from "../../state/ui.ts";
import { projectsAtom } from "../sidebar/Sidebar.tsx";
import { AgentOverview } from "./AgentOverview.tsx";

const environmentId = EnvironmentId.make("environment-1");

function thread(id: string, fields: Partial<EnvironmentThreadShell> = {}): EnvironmentThreadShell {
  return {
    environmentId,
    id: ThreadId.make(id),
    projectId: ProjectId.make("project-a"),
    title: id,
    runtime: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pullRequests: [],
    pendingBackgroundTasks: [],
    tags: [],
    updatedAt: "2026-06-01T10:00:00.000Z",
    archivedAt: null,
    deletedAt: null,
    settledAt: null,
    snoozedUntil: null,
    ...fields,
  } as EnvironmentThreadShell;
}

describe("AgentOverview", () => {
  it("moves through the grid with hjkl and opens a card by enter or number", async () => {
    const keep = { skipInitialRun: true };
    const threads = [
      thread("ask", { hasPendingApprovals: true }),
      thread("r1", { updatedAt: "2026-06-01T09:00:00.000Z" }),
      thread("r2", { updatedAt: "2026-06-01T08:00:00.000Z" }),
    ];
    const registry = AtomRegistry.make({
      initialValues: [
        [environmentThreadShells.quietThreadShellsAtom, threads, keep],
        [projectsAtom, [], keep],
        ...threads.map(
          (t) =>
            [
              environmentThreadDetails.visibleTurnItemsAtom({ environmentId, threadId: t.id }),
              [],
              keep,
            ] as const,
        ),
      ],
    });
    registry.set(overlayAtom, "agent-overview");
    const screen = render(
      <RegistryContext.Provider value={registry}>
        <KeyRouter bindings={[]} commands={new Map()}>
          <AgentOverview focused width={120} height={40} />
        </KeyRouter>
      </RegistryContext.Provider>,
    );
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("1 need you · 0 working"));
      expect(screen.lastFrame()).toContain("Needs approval");
      // Down from "ask" lands on r1, the first card of Recent; right goes to r2.
      screen.stdin.write("j");
      screen.stdin.write("l");
      screen.stdin.write("\r");
      await vi.waitFor(() => expect(registry.get(routeAtom).thread?.threadId).toBe("r2"));
      expect(registry.get(overlayAtom)).toBeNull();

      registry.set(overlayAtom, "agent-overview");
      screen.stdin.write("1");
      await vi.waitFor(() => expect(registry.get(routeAtom).thread?.threadId).toBe("ask"));
    } finally {
      screen.unmount();
    }
  });
});
