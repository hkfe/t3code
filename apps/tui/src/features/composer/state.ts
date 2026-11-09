import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { createEnvironmentRpcQueryAtomFamily } from "@t3tools/client-runtime/state/runtime";
import { createServerEnvironmentAtoms } from "@t3tools/client-runtime/state/server";
import { createThreadEnvironmentAtoms } from "@t3tools/client-runtime/state/threads";
import {
  WS_METHODS,
  type EnvironmentId,
  type ModelSelection,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ScopedThreadRef,
  type ServerConfig,
  type UploadChatImageAttachment,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { Atom } from "effect/reactivity";

import { connectionAtomRuntime } from "../../connection/runtime.ts";
import { newThreadDraftAtom } from "../../state/newThread.ts";
import { environmentShell } from "../../state/shell.ts";
import { EMPTY_EDITOR, type EditorState } from "./editor.ts";
import { newThreadSettings, type TurnThread } from "./settings.ts";

const noInitialConfig = Atom.make<ServerConfig | null>(null);

/** Live server config: providers, their models and option descriptors. */
export const composerServer = createServerEnvironmentAtoms(connectionAtomRuntime, {
  initialConfigValueAtom: () => noInitialConfig,
});

const shellSnapshotAtom = Atom.family((environmentId: EnvironmentId) =>
  Atom.make((get) =>
    Option.getOrNull(get(environmentShell.stateValueAtom(environmentId)).snapshot),
  ),
);

/** The same thread commands web and mobile send turns with. */
export const composerThreadCommands = createThreadEnvironmentAtoms(
  connectionAtomRuntime,
  shellSnapshotAtom,
);

export const projectSearchEntriesAtom = createEnvironmentRpcQueryAtomFamily(connectionAtomRuntime, {
  label: "tui:composer:search-entries",
  tag: WS_METHODS.projectsSearchEntries,
  staleTimeMs: 15_000,
});

/** Unsent work for one thread. Settings override the thread's own until the next send. */
export interface ComposerDraft {
  readonly editor: EditorState;
  readonly attachments: ReadonlyArray<UploadChatImageAttachment>;
  readonly modelSelection?: ModelSelection;
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
}

export const EMPTY_DRAFT: ComposerDraft = { editor: EMPTY_EDITOR, attachments: [] };

// ponytail: drafts live in memory only; a restart drops them.
export const composerDraftAtom = Atom.family((_threadKey: string) =>
  Atom.make<ComposerDraft>(EMPTY_DRAFT).pipe(Atom.keepAlive),
);

export const threadKey = (ref: ScopedThreadRef) => `${ref.environmentId}:${ref.threadId}`;

const turnThreadFamily = Atom.family((key: string) =>
  Atom.make((get): TurnThread | null => {
    const ref = parseScopedThreadKey(key);
    if (ref === null) return null;
    const snapshot = get(shellSnapshotAtom(ref.environmentId));
    const shell = snapshot?.threads.find((thread) => thread.id === ref.threadId);
    if (shell) return shell;
    const newThread = get(newThreadDraftAtom);
    if (newThread === null || threadKey(newThread) !== key) return null;
    const project = snapshot?.projects.find((entry) => entry.id === newThread.projectId) ?? null;
    return newThreadSettings(
      newThread,
      project,
      get(composerServer.configValueAtom(ref.environmentId)),
    );
  }),
);

/** The thread a send goes to: its server shell, or the defaults of a new thread (`chat.new`). */
export const turnThreadAtom = (ref: ScopedThreadRef) => turnThreadFamily(threadKey(ref));
