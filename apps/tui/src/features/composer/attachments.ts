// @effect-diagnostics nodeBuiltinImport:off - a one-shot read in a paste handler, outside any Effect.
import {
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type UploadChatImageAttachment,
} from "@t3tools/contracts";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

/**
 * The image path in pasted text, as terminals paste a dropped file: quoted, with
 * backslash-escaped spaces, or as a file:// URL. Null when the paste is not one image path.
 */
export function pastedImagePath(pasted: string): string | null {
  let value = pasted.trim();
  if (value.length === 0 || value.includes("\n")) return null;
  const quoted = /^(['"])(.*)\1$/.exec(value);
  if (quoted) value = quoted[2]!;
  else value = value.replace(/\\(.)/g, "$1");
  if (value.startsWith("file://")) value = NodeURL.fileURLToPath(value);
  if (value === "~" || value.startsWith("~/"))
    value = NodePath.join(NodeOS.homedir(), value.slice(1));
  if (!NodePath.isAbsolute(value)) return null;
  return IMAGE_MIME_TYPES[NodePath.extname(value).toLowerCase()] ? value : null;
}

/** Reads an image file into the upload shape the server persists. */
export async function readImageAttachment(path: string): Promise<UploadChatImageAttachment> {
  const stat = await NodeFSP.stat(path);
  if (!stat.isFile()) throw new Error(`${path} is not a file.`);
  if (stat.size > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
    throw new Error(`${NodePath.basename(path)} is larger than 10 MiB.`);
  }
  const mimeType = IMAGE_MIME_TYPES[NodePath.extname(path).toLowerCase()]!;
  const data = await NodeFSP.readFile(path);
  return {
    type: "image",
    name: NodePath.basename(path).slice(0, 255),
    mimeType,
    sizeBytes: data.byteLength,
    dataUrl: `data:${mimeType};base64,${data.toString("base64")}`,
  };
}
