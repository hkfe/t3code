import { useAtomValue } from "@effect/atom-react";
import { createEnvironmentShellAtoms } from "@t3tools/client-runtime/state/shell";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Option from "effect/Option";

import { connectionAtomRuntime } from "../connection/runtime.ts";

/** Per environment: projects and thread shells, live from the server's shell stream. */
export const environmentShell = createEnvironmentShellAtoms(connectionAtomRuntime);

/**
 * Whether the server's shell has the thread (active or archived). A thread detail subscription
 * opened before then does not pick the thread up once `chat.new`'s first send creates it.
 */
export function useThreadKnown(ref: ScopedThreadRef): boolean {
  return useAtomValue(environmentShell.stateValueAtom(ref.environmentId), ({ snapshot }) =>
    Option.match(snapshot, {
      onNone: () => false,
      onSome: ({ threads, archivedThreads }) =>
        threads.some((thread) => thread.id === ref.threadId) ||
        archivedThreads.some((thread) => thread.id === ref.threadId),
    }),
  );
}
