import { AtomRegistry } from "effect/reactivity";
import { Box } from "ink";
import { render } from "ink-testing-library";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { Text } from "./text.tsx";
import { appAtomRegistry } from "../connection/runtime.ts";
import { coreFeature } from "../features/core/index.tsx";
import { features } from "../features/index.ts";
import { panesAtom, usePaneRoute } from "../state/panes.ts";
import { focusAtom, routeAtom } from "../state/ui.ts";
import { App } from "./App.tsx";
import type { TuiFeature, TuiViewProps } from "./feature.ts";
import { useRegionInput } from "./input.tsx";

function KeyEcho(props: {
  readonly name: string;
  readonly letter: string;
  readonly first?: boolean;
}) {
  const [seen, setSeen] = useState("no");
  useRegionInput(
    "main",
    (press) => {
      if (press.input !== props.letter) return false;
      setSeen("yes");
      return true;
    },
    { first: props.first === true },
  );
  return (
    <Text>
      {props.name} saw {props.letter}: {seen}
    </Text>
  );
}

const footerFeature: TuiFeature = {
  id: "footer-test",
  views: [
    {
      id: "test",
      component: ({ height }: TuiViewProps) => (
        <Box flexDirection="column">
          <Text>view rows {height}</Text>
          <KeyEcho name="view" letter="v" />
        </Box>
      ),
    },
  ],
  footers: [
    {
      id: "footer-test",
      view: "test",
      component: () => (
        <Box flexDirection="column">
          <Text>footer</Text>
          <KeyEcho name="footer" letter="f" first />
        </Box>
      ),
    },
  ],
};

function PaneView() {
  const route = usePaneRoute();
  return <KeyEcho name={`pane ${route.thread?.threadId}`} letter="v" />;
}

function Broken(): never {
  throw new Error("boom");
}

const brokenFeature: TuiFeature = {
  id: "broken-test",
  views: [{ id: "broken", component: Broken }],
  footers: [{ id: "broken-footer", view: "broken", component: () => <Text>footer ok</Text> }],
  statusItems: [
    { id: "hostile", align: "left", component: () => <Text>{"a\u001b]8;;x\u0007b"}</Text> },
  ],
};

const paneFeature: TuiFeature = { id: "pane-test", views: [{ id: "pane", component: PaneView }] };

describe("App", () => {
  it("shows the pairing screen without a saved server and moves focus and panels by key", async () => {
    // A directory that never exists: the catalog reads as empty and nothing is written.
    vi.stubEnv("T3_TUI_CONFIG_DIR", "/nonexistent/t3-tui-app-test");
    const screen = render(<App registry={appAtomRegistry} features={features} />);
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Not paired"));
      expect(screen.lastFrame()).toContain("Pair with a T3 Code server");
      expect(screen.lastFrame()).toContain("sidebar · ? keys");

      screen.stdin.write("\t");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("main · ? keys"));

      screen.stdin.write("?");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Toggle keybinding help"));
      screen.stdin.write("split");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("ctrl+space v"));
      expect(screen.lastFrame()).not.toContain("Toggle keybinding help");
    } finally {
      screen.unmount();
      vi.unstubAllEnvs();
    }
  });

  it("shows the leader popup, runs the next key's leader binding, and matches function keys", async () => {
    const registry = AtomRegistry.make();
    const screen = render(
      <App
        registry={registry}
        features={[coreFeature, footerFeature]}
        userKeybindings={{ rules: [{ key: "f5", command: "sidebar.toggle" }], errors: [] }}
      />,
    );
    try {
      screen.stdin.write("\x00");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("ctrl+space … · esc cancel"));
      expect(screen.lastFrame()).toContain("? Toggle keybinding help");
      screen.stdin.write("?");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Leader map: ctrl+space"));
      expect(screen.lastFrame()).not.toContain("esc cancel");

      screen.stdin.write("\x1b");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Threads"));
      screen.stdin.write("\x1b[15~");
      await vi.waitFor(() => expect(screen.lastFrame()).not.toContain("Threads"));
    } finally {
      screen.unmount();
      registry.dispose();
    }
  });

  it("gives a view the rows its footer leaves, and both get the keys they use", async () => {
    const registry = AtomRegistry.make();
    registry.set(routeAtom, { view: "test", thread: null });
    registry.set(focusAtom, "main");
    const screen = render(<App registry={registry} features={[coreFeature, footerFeature]} />);
    try {
      // 24 rows: the status bar and the frame leave 21, the two footer rows leave 19.
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("view rows 19"));
      screen.stdin.write("v");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("view saw v: yes"));
      screen.stdin.write("f");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("footer saw f: yes"));
    } finally {
      screen.unmount();
      registry.dispose();
    }
  });

  it("keeps a render error inside its region and strips control bytes from text", async () => {
    using _consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const registry = AtomRegistry.make();
    registry.set(routeAtom, { view: "broken", thread: null });
    const screen = render(<App registry={registry} features={[coreFeature, brokenFeature]} />);
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("broken failed: boom"));
      expect(screen.lastFrame()).toContain("footer ok");
      expect(screen.lastFrame()).toContain("a]8;;xb");
      expect(screen.lastFrame()).not.toContain("\u001b]8");
    } finally {
      screen.unmount();
      registry.dispose();
    }
  });

  it("renders each split pane with its own route and keys only the active one", async () => {
    const registry = AtomRegistry.make();
    const thread = (threadId: string) => ({
      view: "pane",
      thread: { environmentId: "env", threadId } as never,
    });
    registry.set(routeAtom, thread("b"));
    registry.set(panesAtom, {
      routes: [thread("a"), thread("stale")],
      active: 1,
      direction: "row",
    });
    registry.set(focusAtom, "main");
    const screen = render(<App registry={registry} features={[coreFeature, paneFeature]} />);
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("pane a saw v: no"));
      screen.stdin.write("v");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("pane b saw v: yes"));
      expect(screen.lastFrame()).toContain("pane a saw v: no");
      expect(screen.lastFrame()).not.toContain("stale");
    } finally {
      screen.unmount();
      registry.dispose();
    }
  });
});
