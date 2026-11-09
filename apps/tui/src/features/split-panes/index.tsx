import { useAtomValue } from "@effect/atom-react";
import type { AtomRegistry } from "effect/reactivity";

import { Text } from "../../app/text.tsx";
import type { KeyContext, TuiFeature } from "../../app/feature.ts";
import {
  closePane,
  focusNextPane,
  openToSide,
  panesAtom,
  splitPane,
  swapPane,
  type Workspace,
} from "../../state/panes.ts";
import { threadActionTargetAtom } from "../../state/threadActions.ts";
import { focusAtom, routeAtom } from "../../state/ui.ts";
import { theme } from "../../theme/theme.ts";

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
      // Set `threadActionTargetAtom` first to open another thread, as the thread actions do.
      id: "split-panes.openToSide",
      title: "Open thread to the side",
      run: ({ registry }) => {
        const target = registry.get(threadActionTargetAtom);
        if (target !== null) registry.set(threadActionTargetAtom, null);
        const thread = target ?? registry.get(routeAtom).thread;
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
  statusItems: [{ id: "split-panes.status", align: "left", component: PaneStatus }],
};
