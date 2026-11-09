import { RegistryContext } from "@effect/atom-react";
import { useApp, useInput, useStdin } from "ink";
import type * as NodeEvents from "node:events";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { PaneContext } from "../state/panes.ts";
import { terminalFocusedAtom } from "../state/terminal.ts";
import { focusAtom, leaderPendingAtom, overlayAtom, type Region } from "../state/ui.ts";
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
 * Receives keys while `target` has focus (in a split: only in the active pane), after the
 * global bindings. With `first` (text fields) it sees keys before them and returns false for
 * keys it leaves to them. Overlays use "overlay" and always go first. A view and its footer
 * may share a target; handlers then run in mount order until one returns true.
 */
export function useRegionInput(
  target: Target,
  handler: KeyHandler,
  options?: { readonly first?: boolean },
): void {
  const handlers = useContext(HandlersContext);
  if (handlers === null) throw new Error("useRegionInput needs <KeyRouter>.");
  const inactivePane = useContext(PaneContext)?.active === false;
  const first = target === "overlay" || options?.first === true;
  const entry = useRef<Registered>({ handler, first });
  // Updated every render so the router always calls the newest closure.
  useEffect(() => {
    entry.current = { handler, first };
  });
  useEffect(() => {
    if (inactivePane) return;
    const set = handlers.get(target) ?? new Set();
    handlers.set(target, set.add(entry));
    return () => {
      set.delete(entry);
    };
  }, [handlers, target, inactivePane]);
}

export function KeyRouter(props: {
  readonly bindings: ReadonlyArray<TuiKeybinding>;
  readonly commands: ReadonlyMap<string, TuiCommand>;
  readonly children: ReactNode;
}) {
  const registry = useContext(RegistryContext);
  const { exit } = useApp();
  const [handlers] = useState(() => new Map<Target, Set<{ readonly current: Registered }>>());
  // Ink 8 hands useInput an empty `input` for function keys; its stdin context has the raw data.
  const stdin = useStdin() as ReturnType<typeof useStdin> & {
    readonly internal_eventEmitter: NodeEvents.EventEmitter;
  };
  const events = stdin.internal_eventEmitter;
  const sequence = useRef("");
  // Subscribes before useInput below, so each raw sequence lands first.
  useEffect(() => {
    const listener = (data: string) => {
      sequence.current = data;
    };
    events.on("input", listener);
    return () => {
      events.off("input", listener);
    };
  }, [events]);

  useInput((input, key) => {
    // Focus reports (ESC [I, ESC [O) arrive as plain input; text fields must not see them.
    if (input === "[I" || input === "[O") {
      registry.set(terminalFocusedAtom, input === "[I");
      return;
    }
    const press = { input, key, sequence: sequence.current };
    const overlay = registry.get(overlayAtom);
    const focus = registry.get(focusAtom);
    const context = { focus, overlay, registry };
    // After the leader key, the next key picks a leader binding; any other key cancels.
    if (registry.get(leaderPendingAtom)) {
      registry.set(leaderPendingAtom, false);
      const leader = findKeybinding(props.bindings, press, context, true);
      props.commands.get(leader?.command ?? "")?.run({ registry, exit });
      return;
    }
    const targets = [...(handlers.get(overlay === null ? focus : "overlay") ?? [])].map(
      (entry) => entry.current,
    );
    if (targets.some((target) => target.first && target.handler(press))) return;
    const binding = findKeybinding(props.bindings, press, context);
    const command = binding ? props.commands.get(binding.command) : undefined;
    if (command) {
      command.run({ registry, exit });
      return;
    }
    targets.some((target) => !target.first && target.handler(press));
  });

  return <HandlersContext.Provider value={handlers}>{props.children}</HandlersContext.Provider>;
}
