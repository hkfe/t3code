import type { ProjectId, ScopedThreadRef, ThreadEnvMode } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

/**
 * A new thread that exists only on this client, as on web. `chat.new` sets it and routes the
 * thread view to its `threadId`. The first send creates it on the server with
 * `bootstrap.createThread` (and `prepareWorktree` from the project's branch in "worktree" mode).
 */
export interface NewThreadDraft extends ScopedThreadRef {
  readonly projectId: ProjectId;
  readonly envMode: ThreadEnvMode;
}

export const newThreadDraftAtom = Atom.make<NewThreadDraft | null>(null).pipe(Atom.keepAlive);
