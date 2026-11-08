import { RunId, type OrchestrationV2TurnItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  classifyCommandPhase,
  classifyTurnItemPhase,
  deriveWorkingPhase,
} from "./orchestrationV2WorkingPhase.ts";

describe("classifyCommandPhase", () => {
  it.each([
    ["vp test run apps/web/src/a.test.ts", "testing"],
    ["cd apps/server && vp run typecheck", "testing"],
    ["vp run check:changed 2>&1 | tail -40", "testing"],
    ["FOO=1 npx vitest run", "testing"],
    ["cargo clippy --all", "testing"],
    ["npm run build", "testing"],
    ["/bin/zsh -lc 'go test ./...'", "testing"],
    ['rg -n "a|b" src', "reading"],
    ["sed -n 1,40p file.ts | head", "reading"],
    ["git diff --stat", "reading"],
    ["sed -i '' 's/a/b/' file.ts", "editing"],
    ["cargo bench", "measuring"],
    ["hyperfine 'node a.js'", "measuring"],
    ["node scripts/screenshot.mjs", "measuring"],
    ["python script.py | head", null],
    ["npm install", null],
    ["git commit -m test", null],
    ["rm -rf dist", null],
  ] as const)("%s -> %s", (command, phase) => {
    expect(classifyCommandPhase(command)).toBe(phase);
  });
});

const base = {
  threadId: "thread-1",
  runId: "run-1",
  nodeId: null,
  providerThreadId: null,
  providerTurnId: null,
  nativeItemRef: null,
  parentItemId: null,
  status: "running",
  title: null,
  startedAt: null,
  completedAt: null,
  updatedAt: "2026-11-08T00:00:00.000Z",
} as const;

const item = (id: string, ordinal: number, fields: object) =>
  ({ ...base, id, ordinal, ...fields }) as unknown as OrchestrationV2TurnItem;

describe("classifyTurnItemPhase", () => {
  it.each([
    [{ type: "file_change", fileName: "a.ts" }, "editing"],
    [{ type: "web_search" }, "reading"],
    [{ type: "dynamic_tool", toolName: "Read", input: {} }, "reading"],
    [{ type: "dynamic_tool", toolName: "Grep", input: {} }, "reading"],
    [{ type: "dynamic_tool", toolName: "MultiEdit", input: {} }, "editing"],
    [{ type: "dynamic_tool", toolName: "Skill", input: { skill: "code-review" } }, "reviewing"],
    [{ type: "dynamic_tool", toolName: "Skill", input: { skill: "pr-format" } }, null],
    [
      { type: "dynamic_tool", toolName: "Agent", input: { description: "Review the diff" } },
      "reviewing",
    ],
    [{ type: "dynamic_tool", toolName: "mcp__t3-code__preview_snapshot", input: {} }, "measuring"],
    [{ type: "dynamic_tool", toolName: "mcp__playwright__browser_click", input: {} }, "measuring"],
    [{ type: "dynamic_tool", toolName: "TodoWrite", input: {} }, null],
    [{ type: "subagent", title: "Code review", prompt: "" }, "reviewing"],
    [{ type: "command_execution", input: "vp test run" }, "testing"],
  ] as const)("%j -> %s", (fields, phase) => {
    expect(classifyTurnItemPhase(item("item", 1, fields))).toBe(phase);
  });
});

describe("deriveWorkingPhase", () => {
  const activeRun = { id: RunId.make("run-1"), status: "running" as const };
  const read = item("read", 1, { type: "dynamic_tool", toolName: "Read", input: {} });
  const edit = item("edit", 2, { type: "file_change", fileName: "a.ts", status: "completed" });

  it("follows the latest tool item, even after it completes", () => {
    const message = item("message", 3, { type: "assistant_message", text: "", streaming: true });
    expect(deriveWorkingPhase({ activeRun, turnItems: [edit, read, message] })).toBe("editing");
  });

  it("ignores other runs and runs that are not running", () => {
    const stale = item("stale", 9, { type: "file_change", fileName: "a.ts", runId: "run-0" });
    expect(deriveWorkingPhase({ activeRun, turnItems: [read, stale] })).toBe("reading");
    expect(
      deriveWorkingPhase({ activeRun: { ...activeRun, status: "waiting" }, turnItems: [read] }),
    ).toBe(null);
  });
});
