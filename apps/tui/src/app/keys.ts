import type { KeybindingShortcut } from "@t3tools/contracts";
import { matchesKeybindingShortcut, parseKeybindingShortcut } from "@t3tools/shared/keybindings";
import type { Key } from "ink";

import type { KeyContext, TuiKeybinding } from "./feature.ts";

export interface KeyPress {
  readonly input: string;
  readonly key: Key;
  /** Raw escape sequence; Ink gives function keys an empty `input`, so they match on this. */
  readonly sequence?: string;
}

/** Bindings whose key starts with this run after the leader key: `leader v`. */
const LEADER_PREFIX = "leader ";

// xterm and VT220 `ESC [ n ~` numbers of F1-F12.
const TILDE_FUNCTION_KEYS: Record<string, number> = {
  "11": 1,
  "12": 2,
  "13": 3,
  "14": 4,
  "15": 5,
  "17": 6,
  "18": 7,
  "19": 8,
  "20": 9,
  "21": 10,
  "23": 11,
  "24": 12,
};

/** `F1`-`F12` from xterm, VT220, rxvt and Linux console sequences, with or without modifiers. */
function functionKeyName(sequence: string): string | null {
  const letter = /^\x1b(?:O|\[(?:1;\d+)?)([PQRS])$/.exec(sequence)?.[1];
  if (letter) return `F${letter.charCodeAt(0) - 79}`;
  const linux = /^\x1b\[\[([A-E])$/.exec(sequence)?.[1];
  if (linux) return `F${linux.charCodeAt(0) - 64}`;
  const number = /^\x1b\[(\d+)(?:;\d+)?~$/.exec(sequence)?.[1];
  const index = number === undefined ? undefined : TILDE_FUNCTION_KEYS[number];
  return index === undefined ? null : `F${index}`;
}

// Terminals have no Cmd key, so `mod` resolves to ctrl as on Linux.
const TERMINAL_PLATFORM = "linux";

function eventKey({ input, key, sequence }: KeyPress): string {
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
  if (input === "" && sequence) return functionKeyName(sequence) ?? "";
  return input;
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

/** The key after the leader for a leader binding (`leader v` gives `v`), else null. */
export function leaderKeyOf(key: string): string | null {
  return key.startsWith(LEADER_PREFIX) ? key.slice(LEADER_PREFIX.length) : null;
}

/** How a binding reads on screen: `mod` as ctrl, `leader` as the leader key. */
export function displayKey(key: string, leader: string | null): string {
  const after = leaderKeyOf(key);
  const shown = after === null ? key : `${leader ?? "leader"} ${after}`;
  return shown.replace(/\bmod\b/g, "ctrl");
}

/** First direct (or, with `leader`, leader) binding that matches the key and its `when`. */
export function findKeybinding<T extends TuiKeybinding>(
  bindings: ReadonlyArray<T>,
  press: KeyPress,
  context: KeyContext,
  leader = false,
): T | undefined {
  return bindings.find((binding) => {
    const after = leaderKeyOf(binding.key);
    const key = leader ? after : after === null ? binding.key : null;
    return key !== null && isKey(press, key) && (binding.when?.(context) ?? true);
  });
}

/** One string per distinct key press (`mod+k` and `ctrl+k` agree), or null when it does not parse. */
export function keyId(key: string): string | null {
  const after = leaderKeyOf(key);
  const shortcut = parseKeybindingShortcut(after ?? key);
  if (shortcut === null) return null;
  const { ctrlKey, modKey, altKey, shiftKey, metaKey } = shortcut;
  const modifiers = [ctrlKey || modKey, altKey, shiftKey, metaKey]
    .map((on, index) => (on ? ["ctrl+", "alt+", "shift+", "meta+"][index] : ""))
    .join("");
  return `${after === null ? "" : LEADER_PREFIX}${modifiers}${shortcut.key}`;
}
