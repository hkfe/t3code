import type {
  OrchestrationV2Run,
  OrchestrationV2TurnItem,
  OrchestrationV2WorkingPhase,
} from "@t3tools/contracts";
import * as Predicate from "effect/Predicate";

/** Turn item types that can name a phase. The SQL shell read filters on the same list. */
export const WORKING_PHASE_TURN_ITEM_TYPES = [
  "command_execution",
  "dynamic_tool",
  "subagent",
  "file_change",
  "file_search",
  "web_search",
] as const satisfies ReadonlyArray<OrchestrationV2TurnItem["type"]>;

const PHASE_PRIORITY: ReadonlyArray<OrchestrationV2WorkingPhase> = [
  "reading",
  "editing",
  "testing",
  "measuring",
];

const REVIEW = /review/i;
const MEASURE = /screenshot|headless|bench|profil|lighthouse|hyperfine/i;
const TEST_TASK = /^(test|tests|lint|typecheck|check|build|vet|clippy|tsc|fmt|e2e)\b/;
const READ_TOOLS = new Set([
  "read",
  "view",
  "glob",
  "grep",
  "ls",
  "list_dir",
  "read_file",
  "search",
  "webfetch",
  "websearch",
  "notebookread",
]);
const EDIT_TOOLS = new Set([
  "edit",
  "write",
  "multiedit",
  "notebookedit",
  "apply_patch",
  "create_file",
  "str_replace_editor",
]);
const READ_PROGRAMS = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "rg",
  "grep",
  "ag",
  "find",
  "fd",
  "ls",
  "tree",
  "nl",
  "wc",
  "jq",
]);
const TEST_PROGRAMS = new Set([
  "vitest",
  "jest",
  "pytest",
  "mocha",
  "tsc",
  "eslint",
  "oxlint",
  "knip",
  "ruff",
  "mypy",
  "xcodebuild",
  "gradlew",
]);
const TASK_RUNNERS = new Set([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "vp",
  "vpr",
  "cargo",
  "go",
  "make",
  "deno",
  "swift",
  "turbo",
  "nx",
]);
// Neutral segments neither name a phase nor make a command unknown.
const NEUTRAL_PROGRAMS = new Set(["cd", "echo", "true", "export", "set", "sleep", "printf"]);
const PREFIX_PROGRAMS = new Set(["time", "env", "nice", "npx", "bunx", "uvx", "exec"]);

function toolBaseName(toolName: string): string {
  const parts = toolName.toLowerCase().split(/__|\./u);
  return parts[parts.length - 1] ?? "";
}

function inputText(input: unknown, keys: ReadonlyArray<string>): string {
  if (!Predicate.isObject(input)) return "";
  return keys
    .map((key) => Reflect.get(input, key))
    .filter(Predicate.isString)
    .join(" ");
}

function classifyTool(toolName: string, input: unknown): OrchestrationV2WorkingPhase | null {
  const name = toolBaseName(toolName);
  if (READ_TOOLS.has(name)) return "reading";
  if (EDIT_TOOLS.has(name)) return "editing";
  if (name === "skill")
    return REVIEW.test(inputText(input, ["skill", "name"])) ? "reviewing" : null;
  if (name === "agent" || name === "task") {
    return REVIEW.test(inputText(input, ["subagent_type", "description"])) ? "reviewing" : null;
  }
  if (name.includes("screenshot") || name.startsWith("preview_") || name.startsWith("browser_")) {
    return "measuring";
  }
  return null;
}

// Splits on && || ; | outside quotes; quoted text stays inside its segment.
function commandSegments(command: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if (quote !== null) {
      if (char === quote) quote = null;
      current += char;
    } else if (char === '"' || char === "'") {
      quote = char;
      current += char;
    } else if (
      char === ";" ||
      char === "|" ||
      char === "\n" ||
      // 2>&1 and &> are redirects, not separators.
      (char === "&" && command[index - 1] !== ">" && command[index + 1] !== ">")
    ) {
      segments.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  segments.push(current);
  return segments.map((segment) => segment.trim()).filter((segment) => segment.length > 0);
}

/** "neutral" for cd and friends, null for a program the rules do not know. */
function classifySegment(segment: string): OrchestrationV2WorkingPhase | "neutral" | null {
  const tokens = segment.split(/\s+/u).filter((token) => !/^\w+=/u.test(token));
  while (tokens.length > 0 && PREFIX_PROGRAMS.has(tokens[0]!)) tokens.shift();
  if (tokens[0] === "timeout") tokens.splice(0, 2);
  const program = (tokens[0] ?? "").split("/").pop() ?? "";
  const args = tokens.slice(1);
  if (program === "" || NEUTRAL_PROGRAMS.has(program)) return "neutral";
  if (MEASURE.test(segment) && !READ_PROGRAMS.has(program)) return "measuring";
  if (TEST_PROGRAMS.has(program)) return "testing";
  if (TASK_RUNNERS.has(program)) {
    return args.some((arg) => TEST_TASK.test(arg)) ? "testing" : null;
  }
  if (
    program === "apply_patch" ||
    (program === "sed" && args.some((arg) => arg.startsWith("-i")))
  ) {
    return "editing";
  }
  if (program === "sed" || READ_PROGRAMS.has(program)) return "reading";
  if (program === "git") {
    return ["log", "show", "diff", "status", "blame", "grep"].includes(args[0] ?? "")
      ? "reading"
      : null;
  }
  return null;
}

// Conservative: any program the rules do not know makes the whole command unknown.
export function classifyCommandPhase(command: string): OrchestrationV2WorkingPhase | null {
  const wrapped = /^\S*(?:ba|z)?sh\s+-l?c\s+(["'])([\s\S]*)\1\s*$/u.exec(command.trim());
  let best: OrchestrationV2WorkingPhase | null = null;
  for (const segment of commandSegments(wrapped?.[2] ?? command)) {
    const phase = classifySegment(segment);
    if (phase === null) return null;
    if (phase === "neutral") continue;
    if (best === null || PHASE_PRIORITY.indexOf(phase) > PHASE_PRIORITY.indexOf(best)) best = phase;
  }
  return best;
}

export function classifyTurnItemPhase(
  item: OrchestrationV2TurnItem,
): OrchestrationV2WorkingPhase | null {
  switch (item.type) {
    case "file_change":
      return "editing";
    case "file_search":
    case "web_search":
      return "reading";
    case "command_execution":
      return classifyCommandPhase(item.input);
    case "dynamic_tool":
      return item.toolName === null ? null : classifyTool(item.toolName, item.input);
    case "subagent":
      return REVIEW.test(item.title ?? "") ? "reviewing" : null;
    default:
      return null;
  }
}

/** The phase of the active run's most recent tool item; null once nothing is running. */
export function deriveWorkingPhase(input: {
  readonly activeRun: Pick<OrchestrationV2Run, "id" | "status"> | null;
  readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
}): OrchestrationV2WorkingPhase | null {
  if (input.activeRun?.status !== "running") return null;
  const types: ReadonlyArray<string> = WORKING_PHASE_TURN_ITEM_TYPES;
  let latest: OrchestrationV2TurnItem | null = null;
  for (const item of input.turnItems) {
    if (item.runId !== input.activeRun.id || !types.includes(item.type)) continue;
    if (latest === null || item.ordinal >= latest.ordinal) latest = item;
  }
  return latest === null ? null : classifyTurnItemPhase(latest);
}
