export type LineKind = "context" | "add" | "del";
export type ChangeType = "added" | "modified" | "deleted" | "renamed";

export interface DiffLine {
  readonly kind: LineKind;
  readonly text: string;
  readonly oldNo: number | null;
  readonly newNo: number | null;
}

export interface Hunk {
  readonly header: string;
  readonly oldStart: number;
  readonly newStart: number;
  readonly lines: ReadonlyArray<DiffLine>;
}

export interface DiffFile {
  readonly path: string;
  readonly oldPath: string;
  readonly change: ChangeType;
  readonly additions: number;
  readonly deletions: number;
  readonly binary: boolean;
  readonly hunks: ReadonlyArray<Hunk>;
}

interface Draft {
  path: string;
  oldPath: string;
  change: ChangeType;
  additions: number;
  deletions: number;
  binary: boolean;
  hunks: Array<{ header: string; oldStart: number; newStart: number; lines: DiffLine[] }>;
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(path: string): string | null {
  const clean = path.replace(/\t.*$/, "").replace(/^"(.*)"$/, "$1");
  if (clean === "/dev/null") return null;
  return clean.startsWith("a/") || clean.startsWith("b/") ? clean.slice(2) : clean;
}

/** Parses a multi-file unified diff (`git diff` or a host patch). Tabs become two spaces. */
export function parsePatch(patch: string): ReadonlyArray<DiffFile> {
  const files: Draft[] = [];
  let file: Draft | null = null;
  let oldNo = 0;
  let newNo = 0;
  // Lines left in the open hunk, so a removed "-- x" line is never read as a "--- " header.
  let oldLeft = 0;
  let newLeft = 0;
  const start = (oldPath: string, path: string): Draft => {
    file = {
      path,
      oldPath,
      change: "modified",
      additions: 0,
      deletions: 0,
      binary: false,
      hunks: [],
    };
    files.push(file);
    return file;
  };

  for (const raw of patch.split("\n")) {
    const current = file as Draft | null;
    const hunk = current?.hunks.at(-1);
    if (current !== null && hunk !== undefined && (oldLeft > 0 || newLeft > 0)) {
      const kind = raw[0];
      if (kind === "+") {
        hunk.lines.push({ kind: "add", text: detab(raw), oldNo: null, newNo: newNo++ });
        current.additions++;
        newLeft--;
      } else if (kind === "-") {
        hunk.lines.push({ kind: "del", text: detab(raw), oldNo: oldNo++, newNo: null });
        current.deletions++;
        oldLeft--;
      } else if (kind === " " || raw === "") {
        hunk.lines.push({ kind: "context", text: detab(raw), oldNo: oldNo++, newNo: newNo++ });
        oldLeft--;
        newLeft--;
      }
      continue;
    }
    const header = HUNK.exec(raw);
    if (raw.startsWith("diff --git ")) {
      const match = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(raw);
      start(match?.[1] ?? "", match?.[2] ?? match?.[1] ?? "");
    } else if (raw.startsWith("--- ")) {
      const path = stripPrefix(raw.slice(4));
      const target = current !== null && current.hunks.length === 0 ? current : start("", "");
      if (path === null) target.change = "added";
      else target.oldPath = target.path = path;
    } else if (current === null) continue;
    else if (raw.startsWith("+++ ")) {
      const path = stripPrefix(raw.slice(4));
      if (path === null) current.change = "deleted";
      else current.path = path;
    } else if (header !== null) {
      oldNo = Number(header[1]);
      newNo = Number(header[3]);
      oldLeft = header[2] === undefined ? 1 : Number(header[2]);
      newLeft = header[4] === undefined ? 1 : Number(header[4]);
      current.hunks.push({ header: raw, oldStart: oldNo, newStart: newNo, lines: [] });
    } else if (raw.startsWith("new file mode")) current.change = "added";
    else if (raw.startsWith("deleted file mode")) current.change = "deleted";
    else if (raw.startsWith("rename from ")) current.oldPath = raw.slice(12);
    else if (raw.startsWith("rename to ")) current.path = raw.slice(10);
    else if (raw.startsWith("Binary files") || raw.startsWith("GIT binary patch"))
      current.binary = true;
  }

  return files.map((draft) => ({
    ...draft,
    change: draft.change === "modified" && draft.oldPath !== draft.path ? "renamed" : draft.change,
  }));
}

function detab(raw: string): string {
  return raw.slice(1).replaceAll("\t", "  ");
}
