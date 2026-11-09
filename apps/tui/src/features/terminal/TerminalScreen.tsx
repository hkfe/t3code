import { RegistryContext, useAtomMount, useAtomSubscribe } from "@effect/atom-react";
import { runAtomCommand } from "@t3tools/client-runtime/state/runtime";
import type { TerminalBufferState } from "@t3tools/client-runtime/state/terminal";
import type { ScopedThreadRef, TerminalAttachInput } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { Box, Text, usePaste } from "ink";
import { useContext, useEffect, useState } from "react";

import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { terminalEnvironment } from "../../state/threadTerminals.ts";
import type { Region } from "../../state/ui.ts";
import { createEmulator } from "./emulator.ts";
import { canOperate } from "./model.ts";
import { keyBytes, screenRows } from "./screen.ts";

/** Leaves typing mode. Terminals send it as 0x1c, which shells rarely need. */
const LEAVE_KEY = "ctrl+\\";

export interface Launch {
  readonly cwd?: string;
  readonly worktreePath?: string | null;
  readonly env?: Record<string, string>;
}

/**
 * One terminal session: attached when the connection may operate terminals (keys and paste
 * go to the shell while `typing`), else observed read-only.
 */
export function TerminalScreen(props: {
  readonly thread: ScopedThreadRef;
  readonly terminalId: string;
  readonly operate: boolean;
  readonly launch: Launch;
  readonly region: Region;
  readonly focused: boolean;
  readonly typing: boolean;
  readonly width: number;
  readonly height: number;
  readonly onLeave: () => void;
  readonly onExit: () => void;
  readonly onStatus: (status: string) => void;
}) {
  const { thread, terminalId, operate, width, height } = props;
  const { environmentId, threadId } = thread;
  const registry = useContext(RegistryContext);
  const [, setFrame] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [emulator] = useState(() =>
    createEmulator({ cols: width, rows: height }, () => setFrame((frame) => frame + 1)),
  );
  const [attachInput] = useState<TerminalAttachInput>(() => ({
    threadId,
    terminalId,
    ...props.launch,
    cols: width,
    rows: height,
  }));
  const [session] = useState(() =>
    terminalEnvironment.createSession({
      target: { environmentId, threadId, terminalId },
      gridSize: { cols: width, rows: height },
      canOperate: () => canOperate(registry, environmentId),
      onExit: props.onExit,
    }),
  );
  const [onBuffer] = useState(
    () => (result: AsyncResult.AsyncResult<TerminalBufferState, unknown>) => {
      if (result._tag === "Failure") return props.onStatus("error");
      const buffer = AsyncResult.getOrElse(result, () => null);
      if (buffer === null) return;
      emulator.feed(buffer);
      props.onStatus(buffer.status);
    },
  );
  useAtomMount(
    session.driver(operate ? { kind: "attached", input: attachInput } : { kind: "observing" }),
  );
  useAtomSubscribe(
    operate
      ? terminalEnvironment.attach({ environmentId, input: attachInput })
      : terminalEnvironment.observe({ environmentId, input: { threadId, terminalId } }),
    onBuffer,
    { immediate: true },
  );
  // Frees the emulator's buffers on unmount.
  useEffect(() => () => emulator.dispose(), [emulator]);
  // The server PTY follows the pane size.
  useEffect(() => {
    if (!operate) return;
    emulator.resize(width, height);
    session.reportGridSize({ cols: width, rows: height });
  }, [emulator, session, operate, width, height]);

  const write = (data: string) => {
    setScroll(0);
    void runAtomCommand(registry, terminalEnvironment.write, {
      environmentId,
      input: { threadId, terminalId, data },
    });
  };

  const { term } = emulator;
  const buffer = term.buffer.active;
  const visible = Math.min(height, term.rows);
  const bottom = buffer.baseY + term.rows - visible;
  const offset = Math.min(scroll, bottom);
  const page = Math.max(1, Math.floor(visible / 2));

  useRegionInput(
    props.region,
    (press) => {
      if (!props.focused) return false;
      if (props.typing) {
        if (isKey(press, LEAVE_KEY)) {
          props.onLeave();
          return true;
        }
        const bytes = keyBytes(press, term.modes.applicationCursorKeysMode);
        if (bytes !== null) write(bytes);
        return true;
      }
      const step =
        isKey(press, "k") || isKey(press, "arrowup")
          ? 1
          : isKey(press, "j") || isKey(press, "arrowdown")
            ? -1
            : isKey(press, "pageup") || isKey(press, "ctrl+u")
              ? page
              : isKey(press, "pagedown") || isKey(press, "ctrl+d")
                ? -page
                : isKey(press, "g")
                  ? bottom
                  : isKey(press, "shift+g")
                    ? -bottom
                    : 0;
      if (step === 0) return false;
      setScroll(Math.max(0, Math.min(bottom, offset + step)));
      return true;
    },
    { first: true },
  );
  usePaste((text) => write(term.modes.bracketedPasteMode ? `\x1b[200~${text}\x1b[201~` : text), {
    isActive: props.focused && props.typing,
  });

  const top = bottom - offset;
  const cursor =
    props.typing && offset === 0
      ? { line: buffer.baseY + buffer.cursorY, column: buffer.cursorX }
      : null;
  const rows = screenRows(term, top, visible, width, cursor);
  return (
    <Box flexDirection="column" height={height}>
      {rows.map((row, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- a row is a screen position
        <Text key={index} wrap="truncate">
          {row.length === 0
            ? " "
            : row.map((segment, column) => (
                <Text
                  // oxlint-disable-next-line react/no-array-index-key -- a segment is a row position
                  key={column}
                  {...(segment.color === undefined ? {} : { color: segment.color })}
                  {...(segment.backgroundColor === undefined
                    ? {}
                    : { backgroundColor: segment.backgroundColor })}
                  bold={segment.bold ?? false}
                  dimColor={segment.dim ?? false}
                  italic={segment.italic ?? false}
                  underline={segment.underline ?? false}
                  strikethrough={segment.strikethrough ?? false}
                  inverse={segment.inverse ?? false}
                >
                  {segment.text}
                </Text>
              ))}
        </Text>
      ))}
    </Box>
  );
}
