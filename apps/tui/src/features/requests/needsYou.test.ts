import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { nextThread, threadNeedsYou } from "./needsYou.ts";

const ref = (id: string) => ({
  environmentId: EnvironmentId.make("env"),
  threadId: ThreadId.make(id),
});
const request = (kind: string) => ({ kind, id: "r" }) as never;

describe("threadNeedsYou", () => {
  it.each([
    ["approval", { archivedAt: null, pendingRuntimeRequest: request("command") }, true],
    ["question", { archivedAt: null, pendingRuntimeRequest: request("user_input") }, true],
    ["nothing pending", { archivedAt: null, pendingRuntimeRequest: null }, false],
    ["auth refresh", { archivedAt: null, pendingRuntimeRequest: request("auth_refresh") }, false],
    ["tool call", { archivedAt: null, pendingRuntimeRequest: request("dynamic_tool_call") }, false],
    ["archived", { archivedAt: "x" as never, pendingRuntimeRequest: request("command") }, false],
  ])("%s", (_name, thread, expected) => {
    expect(threadNeedsYou(thread)).toBe(expected);
  });
});

describe("nextThread", () => {
  const waiting = [ref("a"), ref("b"), ref("c")];
  it("starts at the first thread, steps forward and wraps", () => {
    expect(nextThread(waiting, null)).toEqual(ref("a"));
    expect(nextThread(waiting, ref("other"))).toEqual(ref("a"));
    expect(nextThread(waiting, ref("a"))).toEqual(ref("b"));
    expect(nextThread(waiting, ref("c"))).toEqual(ref("a"));
    expect(nextThread([], ref("a"))).toBeNull();
  });
});
