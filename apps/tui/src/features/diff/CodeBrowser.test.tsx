import { RegistryContext } from "@effect/atom-react";
import { render } from "ink-testing-library";
import { useState } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

import { KeyRouter } from "../../app/input.tsx";
import { appAtomRegistry } from "../../connection/runtime.ts";
import { focusAtom } from "../../state/ui.ts";
import { CodeBrowser } from "./CodeBrowser.tsx";
import { FIXTURE_PATCH } from "./fixtures.ts";
import { parsePatch } from "./patch.ts";

const files = parsePatch(FIXTURE_PATCH);

function Harness({ onBack }: { readonly onBack: () => void }) {
  const [viewed, setViewed] = useState<ReadonlySet<string>>(new Set());
  return (
    <CodeBrowser
      files={files}
      status={null}
      scope="All commits"
      viewed={{
        isViewed: (path) => viewed.has(path),
        setViewed: (path, on) => setViewed(on ? new Set([...viewed, path]) : new Set()),
      }}
      onBack={onBack}
      region="main"
      width={80}
      height={5}
    />
  );
}

describe("CodeBrowser", () => {
  it("marks files viewed, opens a diff, jumps hunks and closes back to the list", async () => {
    appAtomRegistry.set(focusAtom, "main");
    const onBack = vi.fn();
    const screen = render(
      <RegistryContext.Provider value={appAtomRegistry}>
        <KeyRouter bindings={[]} commands={new Map()}>
          <Harness onBack={onBack} />
        </KeyRouter>
      </RegistryContext.Provider>,
    );
    try {
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("0/5 viewed"));
      screen.stdin.write("v");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("1/5 viewed"));
      screen.stdin.write("\r");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("@@ -1,4 +1,4 @@"));
      screen.stdin.write("n");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("@@ -20,3 +20,2 @@"));
      expect(screen.lastFrame()).not.toContain("@@ -1,4");
      screen.stdin.write("\u001b");
      await vi.waitFor(() => expect(screen.lastFrame()).toContain("1/5 viewed"));
      expect(onBack).not.toHaveBeenCalled();
      screen.stdin.write("\u001b");
      await vi.waitFor(() => expect(onBack).toHaveBeenCalled());
    } finally {
      screen.unmount();
    }
  });
});
