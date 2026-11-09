import { enabledEnvironmentIds } from "@t3tools/client-runtime/state/connections";
import {
  createThreadSearchResultsAtomFamily,
  makeThreadSearchKey,
} from "@t3tools/client-runtime/state/thread-search";
import {
  THREAD_SEARCH_QUERY_MAX_LENGTH,
  type EnvironmentId,
  type OrchestrationV2ThreadShell,
} from "@t3tools/contracts";
import { PALETTE_MESSAGE_LIMIT } from "@t3tools/shared/paletteSearch";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";
import type { Atom, AtomRegistry } from "effect/reactivity";

import type { PaletteItem, PaletteSource } from "../../app/feature.ts";
import { environmentCatalog } from "../../state/catalog.ts";
import { orchestrationEnvironment } from "../../state/orchestration.ts";
import { environmentShell } from "../../state/shell.ts";
import { routeAtom } from "../../state/ui.ts";

interface ThreadEntry {
  readonly environmentId: EnvironmentId;
  readonly thread: OrchestrationV2ThreadShell;
  readonly projectTitle: string | undefined;
}

function environmentIds(get: Atom.AtomContext) {
  return [...enabledEnvironmentIds(get(environmentCatalog.catalogValueAtom))];
}

function shells(get: Atom.AtomContext) {
  return environmentIds(get).flatMap((environmentId) => {
    const snapshot = get(environmentShell.stateValueAtom(environmentId)).snapshot;
    return Option.isSome(snapshot) ? [{ environmentId, snapshot: snapshot.value }] : [];
  });
}

/** Unarchived threads of every enabled environment, newest first. */
export function threadEntries(get: Atom.AtomContext): ReadonlyArray<ThreadEntry> {
  return shells(get)
    .flatMap(({ environmentId, snapshot }) => {
      const projects = new Map(snapshot.projects.map((project) => [project.id, project.title]));
      return snapshot.threads
        .filter((thread) => thread.archivedAt === null)
        .map((thread) => ({ environmentId, thread, projectTitle: projects.get(thread.projectId) }));
    })
    .toSorted(
      (a, b) =>
        DateTime.toEpochMillis(b.thread.updatedAt) - DateTime.toEpochMillis(a.thread.updatedAt),
    );
}

function openThread(registry: AtomRegistry.AtomRegistry, entry: ThreadEntry) {
  registry.set(routeAtom, {
    view: "thread",
    thread: { environmentId: entry.environmentId, threadId: entry.thread.id },
  });
}

const threadSearch = createThreadSearchResultsAtomFamily({
  getSearchAtom: (environmentId, input) =>
    orchestrationEnvironment.threadSearch({ environmentId, input }),
  labelPrefix: "tui:thread-search",
});

export const threadSource: PaletteSource = {
  id: "threads",
  label: "Thread",
  items: (get) =>
    threadEntries(get).map((entry) => ({
      id: `${entry.environmentId}:${entry.thread.id}`,
      title: entry.thread.title || "Untitled thread",
      ...(entry.projectTitle ? { detail: entry.projectTitle } : {}),
      keywords: [entry.projectTitle ?? "", entry.thread.branch ?? ""],
      run: ({ registry }) => openThread(registry, entry),
    })),
};

/** Picking a project opens its newest thread, as on web; projects without threads are left out. */
export const projectSource: PaletteSource = {
  id: "projects",
  label: "Project",
  items: (get) => {
    const newest = new Map<string, ThreadEntry>();
    for (const entry of threadEntries(get)) {
      const key = `${entry.environmentId}:${entry.thread.projectId}`;
      if (!newest.has(key)) newest.set(key, entry);
    }
    return shells(get).flatMap(({ environmentId, snapshot }) =>
      snapshot.projects.flatMap((project) => {
        const id = `${environmentId}:${project.id}`;
        const entry = newest.get(id);
        if (!entry || project.archivedAt) return [];
        return [
          {
            id,
            title: project.title,
            detail: project.workspaceRoot,
            run: ({ registry }) => openThread(registry, entry),
          },
        ];
      }),
    );
  },
};

/** The server's message search; it needs a word of three or more letters. */
export const messageSource: PaletteSource = {
  id: "messages",
  label: "Message",
  search: true,
  items: (get, query) => {
    const trimmed = query.trim().slice(0, THREAD_SEARCH_QUERY_MAX_LENGTH).trim();
    if (trimmed === "") return [];
    const { matches } = get(
      threadSearch.results(makeThreadSearchKey(environmentIds(get), trimmed)),
    );
    if (matches.length === 0) return [];
    const threads = new Map(
      threadEntries(get).map((entry) => [`${entry.environmentId}:${entry.thread.id}`, entry]),
    );
    return matches
      .flatMap((match): ReadonlyArray<PaletteItem> => {
        const entry = threads.get(`${match.environmentId}:${match.threadId}`);
        if (!entry) return [];
        return [
          {
            id: `${entry.environmentId}:${entry.thread.id}:${match.messageId ?? match.snippet}`,
            title: entry.thread.title || "Untitled thread",
            detail: match.snippet.replace(/\s+/g, " ").trim(),
            run: ({ registry }) => openThread(registry, entry),
          },
        ];
      })
      .slice(0, PALETTE_MESSAGE_LIMIT);
  },
};
