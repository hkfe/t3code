import { useAtomValue } from "@effect/atom-react";
import { foldSearchQuery, scoreSearchTerms } from "@t3tools/shared/paletteSearch";
import type { AtomRegistry } from "effect/reactivity";

import { Text } from "../../app/text.tsx";
import type { KeyContext, PaletteSource, TuiFeature } from "../../app/feature.ts";
import {
  closePane,
  focusNextPane,
  openToSide,
  panesAtom,
  splitPane,
  swapPane,
  type Workspace,
} from "../../state/panes.ts";
import { focusAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";
import { threadEntries } from "../command-palette/sources.ts";
import { actionTarget } from "../thread-actions/actions.ts";

function update(registry: AtomRegistry.AtomRegistry, change: (workspace: Workspace) => Workspace) {
  const next = change({ panes: registry.get(panesAtom), route: registry.get(routeAtom) });
  registry.set(panesAtom, next.panes);
  registry.set(routeAtom, next.route);
  registry.set(focusAtom, "main");
}

function PaneStatus() {
  const panes = useAtomValue(panesAtom);
  if (panes.routes.length <= 1) return null;
  return (
    <Text color={theme.textFaint}>
      pane {panes.active + 1}/{panes.routes.length}
    </Text>
  );
}

const SIDE_LIMIT = 8;

/** Threads that match the query, opened in the next pane. Empty until something is typed. */
const threadToSideSource: PaletteSource = {
  id: "threads-to-side",
  label: "To side",
  search: true,
  items: (get, query) => {
    const normalized = foldSearchQuery(query);
    if (normalized === "") return [];
    return threadEntries(get)
      .filter(({ thread, projectTitle }) =>
        scoreSearchTerms(normalized, [thread.title, projectTitle ?? "", thread.branch ?? ""]),
      )
      .slice(0, SIDE_LIMIT)
      .map(({ environmentId, thread, projectTitle }) => ({
        id: `${environmentId}:${thread.id}`,
        title: thread.title || "Untitled thread",
        ...(projectTitle ? { detail: projectTitle } : {}),
        run: ({ registry }) =>
          update(registry, (workspace) =>
            openToSide(workspace, { environmentId, threadId: thread.id }),
          ),
      }));
  },
};

const noOverlay = ({ overlay }: KeyContext) => overlay === null;

export const splitPanesFeature: TuiFeature = {
  id: "split-panes",
  commands: [
    {
      id: "split-panes.splitRight",
      title: "Split pane side by side",
      run: ({ registry }) => update(registry, (workspace) => splitPane(workspace, "row")),
    },
    {
      id: "split-panes.splitDown",
      title: "Split pane stacked",
      run: ({ registry }) => update(registry, (workspace) => splitPane(workspace, "column")),
    },
    {
      id: "split-panes.close",
      title: "Close pane",
      run: ({ registry }) => update(registry, closePane),
    },
    {
      id: "split-panes.focusNext",
      title: "Focus next pane",
      run: ({ registry }) =>
        // From another region, the first press only returns to the active pane.
        update(registry, registry.get(focusAtom) === "main" ? focusNextPane : (w) => w),
    },
    {
      id: "split-panes.swap",
      title: "Swap pane with the next",
      run: ({ registry }) => update(registry, swapPane),
    },
    {
      id: "split-panes.openToSide",
      title: "Open thread to the side",
      run: ({ registry }) => {
        const thread = actionTarget(registry);
        if (thread !== null) update(registry, (workspace) => openToSide(workspace, thread));
      },
    },
  ],
  keybindings: [
    { key: "leader v", command: "split-panes.splitRight", when: noOverlay },
    { key: "leader s", command: "split-panes.splitDown", when: noOverlay },
    { key: "leader x", command: "split-panes.close", when: noOverlay },
    { key: "leader o", command: "split-panes.focusNext", when: noOverlay },
    { key: "leader m", command: "split-panes.swap", when: noOverlay },
  ],
  paletteSources: [threadToSideSource],
  statusItems: [{ id: "split-panes.status", align: "left", component: PaneStatus }],
};
