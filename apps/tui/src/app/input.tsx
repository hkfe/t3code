import { RegistryContext } from "@effect/atom-react";
import { useApp, useInput } from "ink";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { terminalFocusedAtom } from "../state/terminal.ts";
import { focusAtom, overlayAtom, type Region } from "../state/ui.ts";
import type { TuiCommand, TuiKeybinding } from "./feature.ts";
import { findKeybinding, type KeyPress } from "./keys.ts";

/** Return true when the handler used the key. */
export type KeyHandler = (press: KeyPress) => boolean;
type Target = Region | "overlay";

interface Registered {
  readonly handler: KeyHandler;
  readonly first: boolean;
}

const HandlersContext = createContext<Map<Target, Set<{ readonly current: Registered }>> | null>(
  null,
);

/**
 * Receives keys while `target` has focus, after the global bindings. With `first` (text
 * fields) it sees keys before them and returns false for keys it leaves to them.
 * Overlays use "overlay" and always go first. A view and its footer may share a target;
 * handlers then run in mount order until one returns true.
 */
export function useRegionInput(
  target: Target,
  handler: KeyHandler,
  options?: { readonly first?: boolean },
): void {
  const handlers = useContext(HandlersContext);
  if (handlers === null) throw new Error("useRegionInput needs <KeyRouter>.");
  const first = target === "overlay" || options?.first === true;
  const entry = useRef<Registered>({ handler, first });
  // Updated every render so the router always calls the newest closure.
  useEffect(() => {
    entry.current = { handler, first };
  });
  useEffect(() => {
    const set = handlers.get(target) ?? new Set();
    handlers.set(target, set.add(entry));
    return () => {
      set.delete(entry);
    };
  }, [handlers, target]);
}

export function KeyRouter(props: {
  readonly bindings: ReadonlyArray<TuiKeybinding>;
  readonly commands: ReadonlyMap<string, TuiCommand>;
  readonly children: ReactNode;
}) {
  const registry = useContext(RegistryContext);
  const { exit } = useApp();
  const [handlers] = useState(() => new Map<Target, Set<{ readonly current: Registered }>>());

  useInput((input, key) => {
    // Focus reports (ESC [I, ESC [O) arrive as plain input; text fields must not see them.
    if (input === "[I" || input === "[O") {
      registry.set(terminalFocusedAtom, input === "[I");
      return;
    }
    const press = { input, key };
    const overlay = registry.get(overlayAtom);
    const focus = registry.get(focusAtom);
    const targets = [...(handlers.get(overlay === null ? focus : "overlay") ?? [])].map(
      (entry) => entry.current,
    );
    if (targets.some((target) => target.first && target.handler(press))) return;
    const binding = findKeybinding(props.bindings, press, { focus, overlay });
    const command = binding ? props.commands.get(binding.command) : undefined;
    if (command) {
      command.run({ registry, exit });
      return;
    }
    targets.some((target) => !target.first && target.handler(press));
  });

  return <HandlersContext.Provider value={handlers}>{props.children}</HandlersContext.Provider>;
}
