import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentId, OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import { environmentCatalog } from "../../state/catalog.ts";
import { environmentShell } from "../../state/shell.ts";

export interface ThreadListRow {
  readonly environmentId: EnvironmentId;
  readonly thread: OrchestrationV2ThreadShell;
}

/** Unarchived threads of every enabled environment, most recently updated first. */
export function newestFirst(rows: ReadonlyArray<ThreadListRow>): ReadonlyArray<ThreadListRow> {
  return rows
    .filter((row) => row.thread.archivedAt === null)
    .toSorted(
      (a, b) =>
        DateTime.toEpochMillis(b.thread.updatedAt) - DateTime.toEpochMillis(a.thread.updatedAt),
    );
}

export const threadListAtom = Atom.make((get): ReadonlyArray<ThreadListRow> => {
  const rows: ThreadListRow[] = [];
  for (const environmentId of enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))) {
    const snapshot = get(environmentShell.stateValueAtom(environmentId)).snapshot;
    if (Option.isNone(snapshot)) continue;
    for (const thread of snapshot.value.threads) rows.push({ environmentId, thread });
  }
  return newestFirst(rows);
}).pipe(Atom.withLabel("tui-thread-list"));
