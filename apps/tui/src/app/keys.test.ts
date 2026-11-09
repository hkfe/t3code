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
  ] as const)("%s matches %j %j: %s", (shortcut, input, key, expected) => {
    expect(isKey({ input, key: { ...NO_KEY, ...key } }, shortcut)).toBe(expected);
  });
});
