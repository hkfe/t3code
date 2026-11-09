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
import { environmentShell } from "../../state/shell.ts";
import { EMPTY_EDITOR, type EditorState } from "./editor.ts";

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
