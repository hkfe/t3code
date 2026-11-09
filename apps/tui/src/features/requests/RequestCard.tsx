import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  buildPendingUserInputAnswers,
  isPendingUserInputOptionSelected,
  resolvePendingUserInputAnswer,
  setPendingUserInputCustomAnswer,
  togglePendingUserInputOptionSelection,
  type PendingUserInputAnswer,
  type PendingUserInputDraftAnswer,
} from "@t3tools/client-runtime/state/pending-user-input";
import {
  onThreadRequestsResolved,
  pruneResolvedUserInputDrafts,
  seedUserInputDraftAnswers,
  userInputDraftKey,
  type PendingThreadRequests,
  type ThreadPendingApproval,
  type ThreadPendingUserInput,
} from "@t3tools/client-runtime/state/thread-requests";
import type {
  ProviderApprovalDecision,
  ProviderApprovalOption,
  ProviderRequestKind,
  RuntimeRequestId,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { Box } from "ink";
import { useContext, useRef, useState } from "react";

import { revealControls, Text } from "../../app/text.tsx";
import { useRegionInput } from "../../app/input.tsx";
import { isKey, type KeyPress } from "../../app/keys.ts";
import { appAtomRegistry } from "../../connection/runtime.ts";
import { theme } from "../../theme/theme.ts";

/** Each resolves to an error message, or null when the server took the response. */
export interface RequestActions {
  readonly respondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
    feedback?: string,
  ) => Promise<string | null>;
  readonly respondToUserInput: (
    requestId: RuntimeRequestId,
    answers: Record<string, PendingUserInputAnswer>,
  ) => Promise<string | null>;
  readonly dismissUserInput: (requestId: RuntimeRequestId) => Promise<string | null>;
  readonly defer: () => void;
}

interface QuestionDraft {
  readonly answers: Record<string, PendingUserInputDraftAnswer>;
  readonly index: number;
  readonly cursor: number;
  /** True while the "Other" field takes the keys. */
  readonly typing: boolean;
}

const EMPTY_QUESTION_DRAFT: QuestionDraft = { answers: {}, index: 0, cursor: 0, typing: false };

// Kept outside the panel so escape (defer) and thread switches keep half-answered questions.
const questionDraftsAtom = Atom.make<Record<string, QuestionDraft>>({}).pipe(Atom.keepAlive);

onThreadRequestsResolved(({ environmentId, threadId, pendingRequestIds }) => {
  const drafts = appAtomRegistry.get(questionDraftsAtom);
  const pruned = pruneResolvedUserInputDrafts(drafts, environmentId, threadId, pendingRequestIds);
  if (pruned !== drafts) appAtomRegistry.set(questionDraftsAtom, pruned);
});

// One approval shows at a time; its feedback text is null until "f" starts it.
const feedbackAtom = Atom.make<{ readonly requestId: string; readonly text: string } | null>(
  null,
).pipe(Atom.keepAlive);

const DEFAULT_APPROVAL_OPTIONS: ReadonlyArray<ProviderApprovalOption> = [
  { decision: "accept", label: "Approve" },
  { decision: "acceptForSession", label: "Always allow this session" },
  { decision: "decline", label: "Decline" },
  { decision: "cancel", label: "Cancel" },
];

const APPROVAL_TITLE: Record<ProviderRequestKind, string> = {
  command: "Command approval",
  "file-change": "File change approval",
  "file-read": "File read approval",
  permission: "App permission approval",
  "mcp-elicitation": "App access approval",
};

/** Printable input for a text field; control keys go back to the shell. */
function typed(press: KeyPress): string | null {
  const { key } = press;
  if (key.ctrl || key.meta || key.tab || key.escape || key.return) return null;
  if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) return null;
  return press.input.length > 0 ? press.input : null;
}

function digit(press: KeyPress): number | null {
  return /^[1-9]$/.test(press.input) && !press.key.ctrl && !press.key.meta
    ? Number(press.input)
    : null;
}

export function RequestCard(props: {
  readonly thread: ScopedThreadRef;
  readonly requests: PendingThreadRequests | null;
  readonly canRespond: boolean;
  readonly actions: RequestActions;
  readonly focused: boolean;
  readonly height: number;
}) {
  const approval = props.requests?.approvals[0];
  const userInput = props.requests?.userInputs[0];
  const total = (props.requests?.approvals.length ?? 0) + (props.requests?.userInputs.length ?? 0);
  if (!approval && !userInput) {
    return <Idle onDefer={props.actions.defer} />;
  }
  return (
    <Box flexDirection="column" height={props.height} overflow="hidden">
      {approval ? (
        <ApprovalCard
          key={approval.requestId}
          approval={approval}
          canRespond={props.canRespond}
          actions={props.actions}
          height={props.height}
        />
      ) : userInput ? (
        <QuestionCard
          key={userInput.requestId}
          draftKey={userInputDraftKey(
            props.thread.environmentId,
            props.thread.threadId,
            userInput.requestId,
          )}
          request={userInput}
          canRespond={props.canRespond}
          actions={props.actions}
        />
      ) : null}
      {total > 1 && <Text color={theme.textFaint}>+{total - 1} more waiting in this thread</Text>}
    </Box>
  );
}

function Idle({ onDefer }: { readonly onDefer: () => void }) {
  useRegionInput("panel", (press) => {
    if (!isKey(press, "escape")) return false;
    onDefer();
    return true;
  });
  return <Text color={theme.textFaint}>Nothing here needs you. ctrl+r jumps to the next one.</Text>;
}

/** Shared by both cards: sends once at a time and keeps the last error. */
function useSend() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A ref, so a second key before the next render cannot send twice.
  const inFlight = useRef(false);
  const send = (run: () => Promise<string | null>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    void run().then((message) => {
      inFlight.current = false;
      setBusy(false);
      setError(message);
    });
  };
  return { busy, error, send };
}

function Blocked(props: { readonly live: boolean; readonly canRespond: boolean }) {
  if (!props.live)
    return (
      <Text color={theme.warning}>
        The agent can no longer take this answer. Send a new message instead.
      </Text>
    );
  if (!props.canRespond)
    return <Text color={theme.warning}>This connection cannot answer requests.</Text>;
  return null;
}

function Status(props: { readonly busy: boolean; readonly error: string | null }) {
  if (props.busy) return <Text color={theme.textMuted}>Sending…</Text>;
  if (props.error) return <Text color={theme.danger}>{props.error}</Text>;
  return null;
}

function ApprovalCard(props: {
  readonly approval: ThreadPendingApproval;
  readonly canRespond: boolean;
  readonly actions: RequestActions;
  readonly height: number;
}) {
  const { approval, actions } = props;
  const options = approval.options ?? DEFAULT_APPROVAL_OPTIONS;
  const live = approval.responseCapability === "live";
  const enabled = live && props.canRespond;
  const registry = useContext(RegistryContext);
  const feedback = useAtomValue(feedbackAtom, (value) =>
    value?.requestId === approval.requestId ? value.text : null,
  );
  const { busy, error, send } = useSend();

  useRegionInput(
    "panel",
    (press) => {
      const current = registry.get(feedbackAtom);
      const text = current?.requestId === approval.requestId ? current.text : null;
      const setText = (next: string | null) =>
        registry.set(
          feedbackAtom,
          next === null ? null : { requestId: approval.requestId, text: next },
        );
      if (text !== null) {
        if (isKey(press, "escape")) setText(null);
        else if (isKey(press, "enter")) {
          if (text.trim())
            send(() => actions.respondToApproval(approval.requestId, "decline", text.trim()));
        } else if (press.key.backspace || press.key.delete) setText(text.slice(0, -1));
        else {
          const input = typed(press);
          if (input === null) return false;
          setText(text + input);
        }
        return true;
      }
      if (isKey(press, "escape")) {
        actions.defer();
        return true;
      }
      const option = options[(digit(press) ?? 0) - 1];
      if (option && enabled) {
        send(() => actions.respondToApproval(approval.requestId, option.decision));
        return true;
      }
      if (isKey(press, "f") && enabled && approval.supportsFeedback) {
        setText("");
        return true;
      }
      return false;
    },
    { first: true },
  );

  // Room for the title, reason, options, hints and the "+N more" line.
  const detailRows = Math.max(2, props.height - options.length - 8);
  const detailLines = revealControls(approval.detail ?? "")
    .split("\n")
    .filter((line) => line.length > 0);
  return (
    <Box flexDirection="column">
      <Text color={theme.warning} bold>
        {approval.appName ? `${revealControls(approval.appName)}: ` : ""}
        {APPROVAL_TITLE[approval.requestKind]}
      </Text>
      {detailLines.length > 0 && (
        <Text color={theme.text}>{detailLines.slice(0, detailRows).join("\n")}</Text>
      )}
      {detailLines.length > detailRows && (
        <Text color={theme.textFaint}>… {detailLines.length - detailRows} more lines</Text>
      )}
      {approval.reason && (
        <Text color={theme.textMuted} wrap="truncate">
          {revealControls(approval.reason)}
        </Text>
      )}
      <Blocked live={live} canRespond={props.canRespond} />
      <Box flexDirection="column" marginTop={1}>
        {options.map((option, index) => (
          <Text
            key={option.decision}
            wrap="truncate"
            color={enabled ? theme.text : theme.textFaint}
          >
            <Text color={theme.accent}>{index + 1}</Text> {revealControls(option.label)}
            {option.warning ? (
              <Text color={theme.warning}> ⚠ {revealControls(option.warning)}</Text>
            ) : null}
          </Text>
        ))}
        {approval.supportsFeedback && enabled && (
          <Text wrap="truncate" color={theme.text}>
            <Text color={theme.accent}>f</Text> Decline with feedback
          </Text>
        )}
      </Box>
      {feedback !== null && (
        <Text color={theme.text} wrap="wrap">
          <Text color={theme.accent}>feedback › </Text>
          {feedback}
          <Text color={theme.accent}>▏</Text>
        </Text>
      )}
      <Status busy={busy} error={error} />
      <Text color={theme.textFaint} wrap="truncate">
        {feedback !== null ? "enter send · esc back" : "esc later"}
      </Text>
    </Box>
  );
}

function QuestionCard(props: {
  readonly draftKey: string;
  readonly request: ThreadPendingUserInput;
  readonly canRespond: boolean;
  readonly actions: RequestActions;
}) {
  const { request, actions, draftKey } = props;
  const registry = useContext(RegistryContext);
  const stored = useAtomValue(questionDraftsAtom, (drafts) => drafts[draftKey]);
  const { busy, error, send } = useSend();
  const live = request.responseCapability !== "not_resumable";
  const enabled = live && props.canRespond;

  // Keys can arrive faster than renders, so handlers read the draft from the registry.
  const view = (draftState: QuestionDraft | undefined) => {
    const state = draftState ?? EMPTY_QUESTION_DRAFT;
    // Suggested answers show until the user edits them; only edits are stored.
    const answers = seedUserInputDraftAnswers(request.questions, state.answers);
    const index = Math.min(state.index, request.questions.length - 1);
    const question = request.questions[index]!;
    const allowOther = question.allowCustomAnswer !== false;
    const rows = question.options.length + (allowOther ? 1 : 0);
    return { ...state, answers, index, question, allowOther, rows, draft: answers[question.id] };
  };
  const { question, draft, index, rows, allowOther, cursor, typing } = view(stored);
  const isLast = index === request.questions.length - 1;

  const write = (next: Partial<QuestionDraft>) => {
    const drafts = registry.get(questionDraftsAtom);
    const current = drafts[draftKey] ?? EMPTY_QUESTION_DRAFT;
    registry.set(questionDraftsAtom, { ...drafts, [draftKey]: { ...current, ...next } });
  };

  useRegionInput(
    "panel",
    (press) => {
      const now = view(registry.get(questionDraftsAtom)[draftKey]);
      const options = now.question.options;
      const setAnswer = (answer: PendingUserInputDraftAnswer) => {
        const answers = { ...now.answers, [now.question.id]: answer };
        write({ answers });
        return answers;
      };
      const pick = (row: number) => {
        const option = options[row];
        return option
          ? setAnswer(
              togglePendingUserInputOptionSelection(
                now.question,
                now.draft,
                option.value ?? option.label,
              ),
            )
          : now.answers;
      };
      const advance = (answers: Record<string, PendingUserInputDraftAnswer>) => {
        if (resolvePendingUserInputAnswer(now.question, answers[now.question.id]) === null) return;
        if (now.index < request.questions.length - 1)
          return write({ index: now.index + 1, cursor: 0, typing: false });
        write({ typing: false });
        const resolved = buildPendingUserInputAnswers(request.questions, answers);
        if (resolved) send(() => actions.respondToUserInput(request.requestId, resolved));
      };

      if (now.typing) {
        const text = now.draft?.customAnswer ?? "";
        if (isKey(press, "escape")) write({ typing: false });
        else if (isKey(press, "enter")) advance(now.answers);
        else if (press.key.backspace || press.key.delete)
          setAnswer(setPendingUserInputCustomAnswer(now.question, now.draft, text.slice(0, -1)));
        else {
          const input = typed(press);
          if (input === null) return false;
          setAnswer(setPendingUserInputCustomAnswer(now.question, now.draft, text + input));
        }
        return true;
      }
      const row = (digit(press) ?? 0) - 1;
      if (isKey(press, "escape")) actions.defer();
      else if (isKey(press, "arrowdown") || isKey(press, "j"))
        write({ cursor: Math.min(now.cursor + 1, now.rows - 1) });
      else if (isKey(press, "arrowup") || isKey(press, "k"))
        write({ cursor: Math.max(now.cursor - 1, 0) });
      else if (isKey(press, "arrowleft")) write({ index: Math.max(now.index - 1, 0), cursor: 0 });
      else if (isKey(press, "arrowright")) advance(now.answers);
      else if (!enabled) return false;
      else if (row >= 0 && row < now.rows) {
        write({ cursor: row, typing: row >= options.length });
        pick(row);
      } else if (isKey(press, "o") && now.allowOther) write({ cursor: now.rows - 1, typing: true });
      else if (isKey(press, "space")) {
        if (now.cursor < options.length) pick(now.cursor);
        else write({ typing: true });
      } else if (isKey(press, "enter")) {
        const unanswered = resolvePendingUserInputAnswer(now.question, now.draft) === null;
        advance(unanswered && now.cursor < options.length ? pick(now.cursor) : now.answers);
      } else if (isKey(press, "x") && request.dismissible)
        send(() => actions.dismissUserInput(request.requestId));
      else return false;
      return true;
    },
    { first: true },
  );

  const custom = draft?.customAnswer ?? "";
  return (
    <Box flexDirection="column">
      <Text color={theme.warning} bold wrap="truncate">
        {request.questions.length > 1 ? `Question ${index + 1}/${request.questions.length} · ` : ""}
        {revealControls(question.header)}
      </Text>
      <Text color={theme.text}>{revealControls(question.question)}</Text>
      <Blocked live={live} canRespond={props.canRespond} />
      <Box flexDirection="column" marginTop={1}>
        {question.options.map((option, optionIndex) => {
          const selected = isPendingUserInputOptionSelected(
            question,
            draft,
            option.value ?? option.label,
          );
          const mark = question.multiSelect ? (selected ? "[x]" : "[ ]") : selected ? "(•)" : "( )";
          return (
            <Text
              key={option.label}
              wrap="truncate"
              {...(cursor === optionIndex ? { backgroundColor: theme.selection } : {})}
            >
              <Text color={theme.accent}>{optionIndex + 1}</Text>{" "}
              <Text color={selected ? theme.accent : theme.textMuted}>{mark}</Text>{" "}
              <Text color={theme.text}>{revealControls(option.label)}</Text>
              {option.description && (
                <Text color={theme.textFaint}> {revealControls(option.description)}</Text>
              )}
            </Text>
          );
        })}
        {allowOther && (
          <Text wrap="wrap" {...(cursor === rows - 1 ? { backgroundColor: theme.selection } : {})}>
            <Text color={theme.accent}>{rows}</Text> <Text color={theme.textMuted}>Other:</Text>{" "}
            <Text color={theme.text}>{custom}</Text>
            {typing && <Text color={theme.accent}>▏</Text>}
          </Text>
        )}
      </Box>
      <Status busy={busy} error={error} />
      <Text color={theme.textFaint} wrap="wrap">
        {typing
          ? "type your answer · enter next · esc back"
          : [
              `1-${rows} pick`,
              question.multiSelect ? "space toggle" : null,
              isLast ? "enter submit" : "enter next",
              request.questions.length > 1 ? "←→ question" : null,
              request.dismissible ? "x dismiss" : null,
              "esc later",
            ]
              .filter(Boolean)
              .join(" · ")}
      </Text>
    </Box>
  );
}
