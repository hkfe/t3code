import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import { presentThreadShell } from "@t3tools/client-runtime/state/models";
import type { OrchestrationV2WorkingPhase } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import { environmentCatalog } from "../../state/catalog.ts";
import { environmentShell } from "../../state/shell.ts";
import { routeAtom } from "../../state/ui.ts";
import { isTrackedThread, resolveThreadStatus, type ThreadStatus } from "./threadNotifications.ts";

export interface StatusSummary {
  readonly working: number;
  readonly waiting: number;
  readonly current: {
    readonly status: ThreadStatus;
    readonly phase: OrchestrationV2WorkingPhase | null;
    readonly model: string;
  } | null;
}

export const statusSummaryAtom = Atom.make((get): StatusSummary => {
  const route = get(routeAtom).thread;
  let working = 0;
  let waiting = 0;
  let current: StatusSummary["current"] = null;
  for (const environmentId of enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))) {
    const snapshot = get(environmentShell.stateValueAtom(environmentId)).snapshot;
    if (Option.isNone(snapshot)) continue;
    for (const raw of snapshot.value.threads) {
      const isCurrent = route?.environmentId === environmentId && route.threadId === raw.id;
      const tracked = isTrackedThread(raw);
      if (!tracked && !isCurrent) continue;
      const status = resolveThreadStatus(presentThreadShell(environmentId, raw));
      if (isCurrent) {
        current = { status, phase: raw.workingPhase ?? null, model: raw.modelSelection.model };
      }
      if (!tracked) continue;
      if (status === "working") working += 1;
      else if (status === "waiting") waiting += 1;
    }
  }
  return { working, waiting, current };
}).pipe(Atom.withLabel("tui-status-summary"));
