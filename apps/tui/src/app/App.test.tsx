import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vite-plus/test";

import { appAtomRegistry } from "../connection/runtime.ts";
import { features } from "../features/index.ts";
import { App } from "./App.tsx";

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
});
