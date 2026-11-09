import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vite-plus/test";

import { App } from "../../app/App.tsx";
import { appAtomRegistry } from "../../connection/runtime.ts";
import { features } from "../index.ts";

describe("CommandPalette", () => {
  it("lists registered commands with key hints and runs the picked one", async () => {
    vi.stubEnv("T3_TUI_CONFIG_DIR", "/nonexistent/t3-tui-palette-test");
    const screen = render(<App registry={appAtomRegistry} features={features} />);
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Threads"));

      screen.stdin.write("\x0b"); // ctrl+k
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("Toggle keybinding help"));
      expect(screen.lastFrame()).toContain("ctrl+b");

      screen.stdin.write("side");
      await vi.waitFor(() => expect(screen.lastFrame()).not.toContain("Quit"));
      screen.stdin.write("\r");
      await vi.waitFor(() => expect(screen.lastFrame()).not.toContain("Threads"));
      expect(screen.lastFrame()).not.toContain("esc close");
    } finally {
      screen.unmount();
      vi.unstubAllEnvs();
    }
  });
});
