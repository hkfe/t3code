import { AtomRegistry } from "effect/reactivity";
import { Box, Text } from "ink";
import { render } from "ink-testing-library";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { appAtomRegistry } from "../connection/runtime.ts";
import { coreFeature } from "../features/core/index.tsx";
import { features } from "../features/index.ts";
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
    } finally {
      screen.unmount();
      vi.unstubAllEnvs();
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
});
