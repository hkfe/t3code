import {
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  readTerminalOutputUpdate,
  type TerminalBufferState,
} from "@t3tools/client-runtime/state/terminal";
import xterm from "@xterm/headless";

/** Most redraws per second; output faster than this is coalesced into one frame. */
const FRAME_MS = 33;
const SCROLLBACK = 5_000;

export type Emulator = ReturnType<typeof createEmulator>;

/**
 * A VT emulator fed from a terminal's output stream. `onFrame` fires at most once per
 * FRAME_MS after parsed output or a resize, so heavy output does not repaint per chunk.
 */
export function createEmulator(size: { cols: number; rows: number }, onFrame: () => void) {
  const term = new xterm.Terminal({
    cols: size.cols,
    rows: size.rows,
    scrollback: SCROLLBACK,
    allowProposedApi: true,
  });
  let cursor = INITIAL_TERMINAL_OUTPUT_CURSOR;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frame = () => {
    timer ??= setTimeout(() => {
      timer = undefined;
      onFrame();
    }, FRAME_MS);
  };
  const resize = (cols: number, rows: number) => {
    if (cols === term.cols && rows === term.rows) return;
    term.resize(cols, rows);
    frame();
  };
  return {
    term,
    resize,
    /** Writes what the buffer gained since the last call; a reset replays all of it. */
    feed: (buffer: TerminalBufferState) => {
      if (buffer.grid !== null) resize(buffer.grid.cols, buffer.grid.rows);
      const update = readTerminalOutputUpdate(buffer.output, cursor);
      cursor = update.cursor;
      if (update.type === "reset") term.reset();
      if (update.type !== "none") term.write(update.data, frame);
    },
    dispose: () => {
      clearTimeout(timer);
      term.dispose();
    },
  };
}
