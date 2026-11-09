import type { DiffFile } from "./patch.ts";

export type ListRow =
  | { readonly type: "dir"; readonly path: string }
  | { readonly type: "file"; readonly file: DiffFile; readonly name: string; readonly dir: string };

function splitPath(path: string) {
  const slash = path.lastIndexOf("/");
  return { dir: slash === -1 ? "" : path.slice(0, slash + 1), name: path.slice(slash + 1) };
}

/** Flat: files in patch order. Tree: files sorted by folder, under one row per folder. */
export function listRows(files: ReadonlyArray<DiffFile>, tree: boolean): ReadonlyArray<ListRow> {
  if (!tree) return files.map((file) => ({ type: "file", file, ...splitPath(file.path) }));
  const rows: ListRow[] = [];
  let folder: string | null = null;
  const entries = files.map((file) => ({ file, ...splitPath(file.path) }));
  // Root files first, so none sits under the last folder's header.
  entries.sort((a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name));
  for (const { file, dir, name } of entries) {
    if (dir !== folder && dir !== "") rows.push({ type: "dir", path: dir });
    folder = dir;
    rows.push({ type: "file", file, name, dir });
  }
  return rows;
}

const BAR_CELLS = 5;

/** GitHub-style change bar: cells scale with the file's share of the largest change. */
export function changeBar(
  file: DiffFile,
  largest: number,
): { add: number; del: number; rest: number } {
  const total = file.additions + file.deletions;
  if (total === 0 || largest === 0) return { add: 0, del: 0, rest: BAR_CELLS };
  const filled = Math.max(1, Math.round((BAR_CELLS * total) / largest));
  const add = Math.round((filled * file.additions) / total);
  return { add, del: filled - add, rest: BAR_CELLS - filled };
}
