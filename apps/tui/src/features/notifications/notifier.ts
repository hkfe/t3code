import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentId, OrchestrationV2ThreadShell } from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import { Atom, type AtomRegistry } from "effect/reactivity";

import { resolveConfigDir } from "../../connection/configDir.ts";
import { environmentCatalog } from "../../state/catalog.ts";
import { environmentShell } from "../../state/shell.ts";
import { terminalFocusedAtom } from "../../state/terminal.ts";
import { toastAtom } from "../../state/toast.ts";
import { routeAtom } from "../../state/ui.ts";
import {
  createThreadNotifier,
  deliverNotification,
  detectDesktopProtocol,
  FOCUS_REPORTING_OFF,
  FOCUS_REPORTING_ON,
  parseNotificationSettings,
} from "./threadNotifications.ts";

const TOAST_MS = 8000;

/** Live thread lists per enabled environment; null while a shell is not live. */
const liveThreadsAtom = Atom.make((get) =>
  Array.from(enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom)), (environmentId) => {
    const shell = get(environmentShell.stateValueAtom(environmentId));
    const threads: ReadonlyArray<OrchestrationV2ThreadShell> | null =
      shell.status === "live" && Option.isSome(shell.snapshot)
        ? shell.snapshot.value.threads
        : null;
    return [environmentId, threads] as const;
  }),
).pipe(Atom.withLabel("tui-notification-threads"));

const loadSettings = Effect.fn("tui.notifications.loadSettings")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const file = path.join(yield* resolveConfigDir(process.env), "notifications.json");
  const text = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => null));
  return parseNotificationSettings(text);
});

/** Watches every enabled environment and notifies until the returned stop runs. */
export function startNotifications(
  registry: AtomRegistry.AtomRegistry,
  write: (data: string) => void,
): () => void {
  // Defaults until the file is read; the first snapshot is only a baseline anyway.
  let settings = parseNotificationSettings(null);
  void Effect.runPromise(loadSettings().pipe(Effect.provide(NodeServices.layer))).then(
    (loaded) => (settings = loaded),
  );
  const protocol = detectDesktopProtocol(process.env);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const notifier = createThreadNotifier((notification) => {
    const route = registry.get(routeAtom);
    const output = deliverNotification(notification, {
      inView:
        route.view === "thread" &&
        route.thread?.environmentId === notification.ref.environmentId &&
        route.thread.threadId === notification.ref.threadId,
      focused: registry.get(terminalFocusedAtom),
      settings,
      protocol,
    });
    if (output.write) write(output.write);
    const toast = output.toast;
    if (!toast) return;
    registry.set(toastAtom, toast);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (registry.get(toastAtom) === toast) registry.set(toastAtom, null);
    }, TOAST_MS);
  });
  const unsubscribe = registry.subscribe(
    liveThreadsAtom,
    (environments) => {
      notifier.retain(new Set<EnvironmentId>(environments.map(([id]) => id)));
      for (const [environmentId, threads] of environments) {
        if (threads !== null) notifier.observe(environmentId, threads);
      }
    },
    { immediate: true },
  );
  write(FOCUS_REPORTING_ON);
  return () => {
    unsubscribe();
    clearTimeout(toastTimer);
    write(FOCUS_REPORTING_OFF);
  };
}
