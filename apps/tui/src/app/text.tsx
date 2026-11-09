import { Text as InkText, type TextProps } from "ink";
import type { ReactNode } from "react";

// ESC, C1 and the other C0 bytes start or steer escape sequences (OSC 8 links, OSC 52
// clipboard writes, cursor moves). Untrusted text keeps only tab and newline.
const CONTROL = /\r\n|[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/gu;

export function sanitizeTerminalText(text: string): string {
  return text.replace(CONTROL, (char) => (char === "\r\n" ? "\n" : ""));
}

/** Like `sanitizeTerminalText`, but shows each removed byte (`^[`, `^?`, `\x9b`). */
export function revealControls(text: string): string {
  return text.replace(CONTROL, (char) => {
    if (char === "\r\n") return "\n";
    const code = char.charCodeAt(0);
    if (code < 0x20) return `^${String.fromCharCode(code + 0x40)}`;
    if (code === 0x7f) return "^?";
    return `\\x${code.toString(16)}`;
  });
}

function clean(node: ReactNode): ReactNode {
  if (typeof node === "string") return sanitizeTerminalText(node);
  if (Array.isArray(node)) return node.map(clean);
  return node;
}

/** Ink's `Text` with control bytes removed from its string children. Use it, not Ink's. */
export function Text(props: TextProps) {
  return <InkText {...props}>{clean(props.children)}</InkText>;
}
