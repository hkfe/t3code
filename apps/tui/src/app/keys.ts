import type { KeybindingShortcut } from "@t3tools/contracts";
import { matchesKeybindingShortcut, parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import type { Key } from "ink";

import type { KeyContext, TuiKeybinding } from "./feature.ts";

export interface KeyPress {
  readonly input: string;
  readonly key: Key;
}

// Terminals have no Cmd key, so `mod` resolves to ctrl as on Linux.
const TERMINAL_PLATFORM = "linux";

function eventKey({ input, key }: KeyPress): string {
  if (key.upArrow) return "ArrowUp";
  if (key.downArrow) return "ArrowDown";
  if (key.leftArrow) return "ArrowLeft";
  if (key.rightArrow) return "ArrowRight";
  if (key.pageUp) return "PageUp";
  if (key.pageDown) return "PageDown";
  if (key.home) return "Home";
  if (key.end) return "End";
  if (key.return) return "Enter";
  if (key.escape) return "Escape";
  if (key.tab) return "Tab";
  if (key.backspace) return "Backspace";
  if (key.delete) return "Delete";
  return input === " " ? " " : input;
}

const parsed = new Map<string, KeybindingShortcut>();

/** True when `press` is the shortcut `shortcut`, written like `ctrl+k` or `shift+tab`. */
export function isKey(press: KeyPress, shortcut: string): boolean {
  let parsedShortcut = parsed.get(shortcut);
  if (parsedShortcut === undefined) {
    const next = parseKeybindingShortcut(shortcut);
    if (next === null) throw new Error(`Invalid TUI keybinding: ${shortcut}`);
    parsed.set(shortcut, next);
    parsedShortcut = next;
  }
  return matchesKeybindingShortcut(
    {
      key: eventKey(press),
      metaKey: press.key.super,
      ctrlKey: press.key.ctrl,
      shiftKey: press.key.shift,
      altKey: press.key.meta,
    },
    parsedShortcut,
    TERMINAL_PLATFORM,
  );
}

/** First binding that matches the key and its `when`, in registration order. */
export function findKeybinding(
  bindings: ReadonlyArray<TuiKeybinding>,
  press: KeyPress,
  context: KeyContext,
): TuiKeybinding | undefined {
  return bindings.find((binding) => isKey(press, binding.key) && (binding.when?.(context) ?? true));
}
