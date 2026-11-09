import type { Key } from "ink";
import { describe, expect, it } from "vite-plus/test";

import { isKey } from "./keys.ts";

const NO_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
};

describe("isKey", () => {
  it.each([
    ["ctrl+b", "b", { ctrl: true }, true],
    ["mod+b", "b", { ctrl: true }, true],
    ["mod+b", "b", {}, false],
    ["shift+tab", "", { tab: true, shift: true }, true],
    ["tab", "", { tab: true, shift: true }, false],
    ["alt+arrowleft", "", { leftArrow: true, meta: true }, true],
    ["enter", "\r", { return: true }, true],
    ["j", "j", {}, true],
    ["shift+j", "J", { shift: true }, true],
    ["?", "?", {}, true],
    ["home", "", { home: true }, true],
    ["end", "", { end: true }, true],
    ["pageup", "", { pageUp: true }, true],
    ["pagedown", "", { pageDown: true }, true],
    ["ctrl+space", " ", { ctrl: true }, true],
    ["space", " ", { ctrl: true }, false],
    ["ctrl+\\", "\\", { ctrl: true }, true],
  ] as const)("%s matches %j %j: %s", (shortcut, input, key, expected) => {
    expect(isKey({ input, key: { ...NO_KEY, ...key } }, shortcut)).toBe(expected);
  });

  // Ink gives function keys an empty `input`; the raw sequence names them.
  it.each([
    ["f1", "\x1bOP", {}, true],
    ["f4", "\x1b[S", {}, true],
    ["f1", "\x1b[11~", {}, true],
    ["f5", "\x1b[15~", {}, true],
    ["f5", "\x1b[[E", {}, true],
    ["f6", "\x1b[17~", {}, true],
    ["f10", "\x1b[21~", {}, true],
    ["f12", "\x1b[24~", {}, true],
    ["ctrl+f5", "\x1b[15;5~", { ctrl: true }, true],
    ["shift+f1", "\x1b[1;2P", { shift: true }, true],
    ["f5", "\x1b[15;5~", { ctrl: true }, false],
    ["f2", "\x1bOP", {}, false],
    ["f1", "\x1b[16~", {}, false],
  ] as const)("%s matches sequence %j %j: %s", (shortcut, sequence, key, expected) => {
    expect(isKey({ input: "", key: { ...NO_KEY, ...key }, sequence }, shortcut)).toBe(expected);
  });
});
