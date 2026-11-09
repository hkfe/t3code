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
  "reasoning",
  "assistant_message",
] as const satisfies ReadonlyArray<OrchestrationV2TurnItem["type"]>;

type Phase = OrchestrationV2WorkingPhase;

// Inside one command the later phase wins: `vp test && git push` is pushing.
const COMMAND_PRIORITY: ReadonlyArray<Phase> = [
  "running",
  "waiting",
  "reading",
  "editing",
  "installing",
  "building",
  "testing",
  "measuring",
  "committing",
  "pushing",
];

const REVIEW = /review/i;
const MEASURE = /screenshot|headless|bench|profil|lighthouse|hyperfine/i;
const TEST_TASK = /^(test|tests|lint|typecheck|check|vet|clippy|tsc|fmt|e2e)\b/;
const BUILD_TASK = /^(build|compile|bundle|package|pack)\b/;
const INSTALL_TASKS = new Set(["install", "i", "add", "ci", "sync"]);

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
  "lsp",
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
const PLAN_TOOLS = new Set([
  "skill",
  "toolsearch",
  "todowrite",
  "enterplanmode",
  "exitplanmode",
  "askuserquestion",
  "update_plan",
  "request_user_input",
]);
const WAIT_TOOLS = /wait|^monitor$|^taskstop$|^task_status$|^schedulewakeup$|^watch_/;
const DELEGATE_TOOLS =
  /^(agent|task|sendmessage|spawn_agent|delegate_task|create_threads)$|^t3_thread_(launch|send)/;
const READ_VERBS = /^(read|list|get|search|fetch|find|query|view)|_(read|list|status)$/;
const EDIT_VERBS = /^(create|update|write|edit|delete|move|restore)_/;

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
  "awk",
  "stat",
  "file",
  "diff",
  "cmp",
  "du",
  "which",
  "curl",
  "wget",
  "ps",
  "pgrep",
  "lsof",
  "sqlite3",
  "plutil",
  "mdfind",
]);
const EDIT_PROGRAMS = new Set([
  "apply_patch",
  "mkdir",
  "touch",
  "cp",
  "mv",
  "rm",
  "rmdir",
  "ln",
  "chmod",
  "tee",
  "patch",
  "truncate",
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
const PACKAGE_MANAGERS = new Set(["brew", "pip", "pip3", "uv", "gem", "apt", "apt-get"]);
const GIT_READ = new Set(["log", "show", "diff", "status", "blame", "grep", "fetch", "pull"]);
const GIT_COMMIT = new Set([
  "add",
  "commit",
  "merge",
  "rebase",
  "cherry-pick",
  "checkout",
  "switch",
  "reset",
  "stash",
  "update-ref",
  "worktree",
  "restore",
  "rm",
  "mv",
  "tag",
]);
const GH_PUSH = /^(pr (create|merge|ready|edit|comment|review|close)|release create|repo create)\b/;
const GH_READ = /^(pr (view|list|diff|checks|status)|api|run (view|list)|issue (view|list))\b/;
// Neutral segments name no phase: cd, assignments, shell keywords.
const NEUTRAL_PROGRAMS = new Set([
  "cd",
  "pushd",
  "popd",
  "echo",
  "printf",
  "true",
  "false",
  "export",
  "set",
  "unset",
  "source",
  ".",
  "pwd",
  "test",
  "[",
  "[[",
  "for",
  "fi",
  "done",
  "esac",
]);
const KEYWORD_PREFIXES = new Set(["if", "then", "else", "elif", "do", "while", "until", "!"]);
const PREFIX_PROGRAMS = new Set(["time", "env", "nice", "npx", "bunx", "uvx", "exec", "command"]);

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

function classifyTool(toolName: string, input: unknown): Phase {
  const name = toolBaseName(toolName);
  if (name === "bash") return classifyCommandPhase(inputText(input, ["command"])) ?? "running";
  if (READ_TOOLS.has(name)) return "reading";
  if (EDIT_TOOLS.has(name)) return "editing";
  if (name === "skill" && REVIEW.test(inputText(input, ["skill", "name"]))) return "reviewing";
  if (PLAN_TOOLS.has(name)) return "planning";
  if (name === "agent" || name === "task") {
    const text = inputText(input, ["subagent_type", "description"]);
    if (REVIEW.test(text)) return "reviewing";
  }
  if (DELEGATE_TOOLS.test(name)) return "delegating";
  if (WAIT_TOOLS.test(name)) return "waiting";
  if (name.includes("screenshot") || name.startsWith("preview_") || name.startsWith("browser_")) {
    return "measuring";
  }
  if (name.includes("pull_request")) return "pushing";
  if (READ_VERBS.test(name)) return "reading";
  if (EDIT_VERBS.test(name)) return "editing";
  return "running";
}

// Heredoc bodies are file content, not commands.
const stripHeredocs = (command: string) =>
  command.replace(/<<-?\s*(['"]?)(\w+)\1([^\n]*)\n[\s\S]*?\n\s*\2[ \t]*(?=\n|$)/gu, "<<$2$3");

// Splits on && || ; | ( ) and newlines outside quotes; quoted text stays inside its segment.
// A segment fed by a pipe starts with "|".
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
      char === "(" ||
      char === ")" ||
      // 2>&1 and &> are redirects, not separators.
      (char === "&" && command[index - 1] !== ">" && command[index + 1] !== ">")
    ) {
      segments.push(current);
      const pipe = char === "|" && command[index - 1] !== "|" && command[index + 1] !== "|";
      current = pipe ? "|" : "";
    } else {
      current += char;
    }
  }
  segments.push(current);
  return segments
    .map((segment) => segment.trim())
    .filter((segment) => segment.replace("|", "") !== "");
}

// `> file` or `>> file`, but not 2>&1 or /dev/null.
const writesFile = (segment: string) =>
  /(?:^|[^\d&>])>>?\s*(?!&|\/dev\/null)[^\s|&;]/u.test(segment.replace(/(["'])[\s\S]*?\1/gu, ""));

function classifySegment(segment: string): Phase | "neutral" {
  const tokens = segment.split(/\s+/u).filter((token) => token.length > 0);
  while (tokens.length > 0 && KEYWORD_PREFIXES.has(tokens[0]!)) tokens.shift();
  while (tokens.length > 0 && /^\w+=/u.test(tokens[0]!)) tokens.shift();
  while (tokens.length > 0 && PREFIX_PROGRAMS.has(tokens[0]!)) tokens.shift();
  if (tokens[0] === "timeout") tokens.splice(0, 2);
  const program = (tokens[0] ?? "").split("/").pop() ?? "";
  const args = tokens.slice(1);
  if (program === "" || NEUTRAL_PROGRAMS.has(program)) return "neutral";
  if (program === "sleep" || program === "wait") return "waiting";
  // A test run wins over measure words in its arguments, such as a test name filter.
  if (TEST_PROGRAMS.has(program)) return "testing";
  if (TASK_RUNNERS.has(program)) {
    if (INSTALL_TASKS.has(args[0] ?? "")) return "installing";
    if (args.some((arg) => TEST_TASK.test(arg))) return "testing";
    if (args.some((arg) => BUILD_TASK.test(arg))) return "building";
  }
  if (PACKAGE_MANAGERS.has(program) && args.some((arg) => INSTALL_TASKS.has(arg))) {
    return "installing";
  }
  if (MEASURE.test(segment) && !READ_PROGRAMS.has(program)) return "measuring";
  if (program === "git") {
    const sub =
      args.filter(
        (arg, i) => !arg.startsWith("-") && args[i - 1] !== "-C" && args[i - 1] !== "-c",
      )[0] ?? "";
    if (sub === "push") return "pushing";
    if (GIT_COMMIT.has(sub)) return "committing";
    if (GIT_READ.has(sub)) return "reading";
    return "running";
  }
  if (program === "gh") {
    const sub = args.join(" ");
    if (GH_PUSH.test(sub)) return "pushing";
    if (GH_READ.test(sub)) return "reading";
    return "running";
  }
  if (
    EDIT_PROGRAMS.has(program) ||
    (program === "sed" && args.some((arg) => arg.startsWith("-i"))) ||
    (program === "perl" && args.some((arg) => /^-\w*i/u.test(arg))) ||
    writesFile(segment)
  ) {
    return "editing";
  }
  if (program === "sed" || READ_PROGRAMS.has(program)) return "reading";
  return "running";
}

/** The phase of a shell command; null only for an empty command. */
export function classifyCommandPhase(command: string): Phase | null {
  const wrapped = /^\S*(?:ba|z)?sh\s+-l?c\s+(["'])([\s\S]*)\1\s*$/u.exec(command.trim());
  const text = stripHeredocs(wrapped?.[2] ?? command).trim();
  if (text === "") return null;
  // A poll loop such as `until grep -q ready log; do sleep 1; done` is waiting.
  if (/^(until|while)\b[\s\S]*\bsleep\b/u.test(text)) return "waiting";
  let best: Phase = "running";
  for (const segment of commandSegments(text)) {
    const piped = segment.startsWith("|");
    const phase = classifySegment(piped ? segment.slice(1) : segment);
    // `| head` or `| grep x` only filters output.
    if (phase === "neutral" || (piped && phase === "reading")) continue;
    if (COMMAND_PRIORITY.indexOf(phase) > COMMAND_PRIORITY.indexOf(best)) best = phase;
  }
  return best;
}

export function classifyTurnItemPhase(item: OrchestrationV2TurnItem): Phase | null {
  switch (item.type) {
    case "reasoning":
      return "thinking";
    case "assistant_message":
      return "responding";
    case "file_change":
      return "editing";
    case "file_search":
    case "web_search":
      return "reading";
    case "command_execution":
      return classifyCommandPhase(item.input) ?? "running";
    case "dynamic_tool":
      return item.toolName === null ? "running" : classifyTool(item.toolName, item.input);
    case "subagent":
      return REVIEW.test(item.title ?? "") ? "reviewing" : "delegating";
    default:
      return null;
  }
}

/** The phase of the active run's most recent item; thinking before its first item. */
export function deriveWorkingPhase(input: {
  readonly activeRun: Pick<OrchestrationV2Run, "id" | "status"> | null;
  readonly turnItems: ReadonlyArray<OrchestrationV2TurnItem>;
}): Phase | null {
  if (input.activeRun?.status !== "running") return null;
  const types: ReadonlyArray<string> = WORKING_PHASE_TURN_ITEM_TYPES;
  let latest: OrchestrationV2TurnItem | null = null;
  for (const item of input.turnItems) {
    if (item.runId !== input.activeRun.id || !types.includes(item.type)) continue;
    // Same order as the SQL shell read: ordinal, then id.
    if (
      latest === null ||
      item.ordinal > latest.ordinal ||
      (item.ordinal === latest.ordinal && item.id > latest.id)
    ) {
      latest = item;
    }
  }
  return latest === null ? "thinking" : (classifyTurnItemPhase(latest) ?? "thinking");
}
