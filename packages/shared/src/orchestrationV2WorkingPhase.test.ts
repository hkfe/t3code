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
    ["npm run build", "building"],
    ["vp run --filter @t3tools/tui build 2>&1 | tail -1", "building"],
    ["/bin/zsh -lc 'go test ./...'", "testing"],
    ['rg -n "a|b" src', "reading"],
    ["sed -n 1,40p file.ts | head", "reading"],
    ["git diff --stat", "reading"],
    ["sed -i '' 's/a/b/' file.ts", "editing"],
    ["npm test -- --testNamePattern=profiling", "testing"],
    ["npx vitest run bench.test.ts", "testing"],
    ["cargo bench", "measuring"],
    ["hyperfine 'node a.js'", "measuring"],
    ["node scripts/screenshot.mjs", "measuring"],
    ["python script.py | head", "running"],
    ["echo hi", "running"],
    ["", null],
    ["npm install", "installing"],
    ["vp i > /tmp/install.log 2>&1", "installing"],
    ["brew install jq", "installing"],
    ["git -C repo add -A && git commit -m test", "committing"],
    ["git fetch fork && git log --oneline -1", "reading"],
    ["vp test run && git push fork HEAD:main", "pushing"],
    ["gh pr create --base main --body-file /tmp/b.md", "pushing"],
    ["gh pr view 20 --json state", "reading"],
    ["rm -rf dist", "editing"],
    ["mkdir -p out", "editing"],
    ["cat > notes.md <<'EOF'\nrun vp test\ngit push\nEOF", "editing"],
    ["python3 - <<'EOF'\nimport os\nEOF\nvp test run", "testing"],
    ["grep x a.ts 2>/dev/null > /dev/null", "reading"],
    ['export PATH="$HOME/bin:$PATH"; X=1 rg foo', "reading"],
    ["until grep -q ready log; do sleep 1; done", "waiting"],
    ["sleep 30", "waiting"],
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
    [{ type: "dynamic_tool", toolName: "Skill", input: { skill: "pr-format" } }, "planning"],
    [{ type: "dynamic_tool", toolName: "ToolSearch", input: {} }, "planning"],
    [{ type: "dynamic_tool", toolName: "Agent", input: { description: "Fix bug" } }, "delegating"],
    [{ type: "dynamic_tool", toolName: "mcp__t3-code__t3_thread_launch", input: {} }, "delegating"],
    [{ type: "dynamic_tool", toolName: "mcp__t3-code__t3_background_wait", input: {} }, "waiting"],
    [{ type: "dynamic_tool", toolName: "Monitor", input: {} }, "waiting"],
    [{ type: "dynamic_tool", toolName: "mcp__t3-code__link_pull_request", input: {} }, "pushing"],
    [{ type: "dynamic_tool", toolName: "mcp__docs__list_documents", input: {} }, "reading"],
    [{ type: "dynamic_tool", toolName: "mcp__docs__update_document", input: {} }, "editing"],
    [{ type: "dynamic_tool", toolName: "Bash", input: { command: "vp test" } }, "testing"],
    [{ type: "dynamic_tool", toolName: "mcp__x__something", input: {} }, "running"],
    [{ type: "subagent", title: "Fix the bug", prompt: "" }, "delegating"],
    [{ type: "reasoning", text: "" }, "thinking"],
    [{ type: "assistant_message", text: "", streaming: true }, "responding"],
    [
      { type: "dynamic_tool", toolName: "Agent", input: { description: "Review the diff" } },
      "reviewing",
    ],
    [{ type: "dynamic_tool", toolName: "mcp__t3-code__preview_snapshot", input: {} }, "measuring"],
    [{ type: "dynamic_tool", toolName: "mcp__playwright__browser_click", input: {} }, "measuring"],
    [{ type: "dynamic_tool", toolName: "TodoWrite", input: {} }, "planning"],
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

  it("follows the latest item, even after it completes", () => {
    const message = item("message", 3, { type: "assistant_message", text: "", streaming: true });
    expect(deriveWorkingPhase({ activeRun, turnItems: [read, edit] })).toBe("editing");
    expect(deriveWorkingPhase({ activeRun, turnItems: [edit, read, message] })).toBe("responding");
  });

  it("is thinking before the first item and while the model reasons", () => {
    const reasoning = item("reasoning", 3, { type: "reasoning", text: "" });
    expect(deriveWorkingPhase({ activeRun, turnItems: [] })).toBe("thinking");
    expect(deriveWorkingPhase({ activeRun, turnItems: [edit, reasoning] })).toBe("thinking");
  });

  it("breaks an ordinal tie by id, like the SQL shell read", () => {
    const tied = item("z-read", 2, { type: "dynamic_tool", toolName: "Read", input: {} });
    expect(deriveWorkingPhase({ activeRun, turnItems: [tied, edit] })).toBe("reading");
    expect(deriveWorkingPhase({ activeRun, turnItems: [edit, tied] })).toBe("reading");
  });

  it("ignores other runs and runs that are not running", () => {
    const stale = item("stale", 9, { type: "file_change", fileName: "a.ts", runId: "run-0" });
    expect(deriveWorkingPhase({ activeRun, turnItems: [read, stale] })).toBe("reading");
    expect(
      deriveWorkingPhase({ activeRun: { ...activeRun, status: "waiting" }, turnItems: [read] }),
    ).toBe(null);
  });
});
