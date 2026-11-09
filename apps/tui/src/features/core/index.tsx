import type { AtomRegistry } from "effect/reactivity";

import type { TuiFeature } from "../../app/feature.ts";
import {
  focusAtom,
  layoutAtom,
  MIN_REGION_WIDTH,
  overlayAtom,
  visibleRegions,
  type Layout,
} from "../../state/ui.ts";
import { HelpPanel } from "./HelpPanel.tsx";

const RESIZE_STEP = 4;

function moveFocus(registry: AtomRegistry.AtomRegistry, step: 1 | -1) {
  const regions = visibleRegions(registry.get(layoutAtom));
  const index = regions.indexOf(registry.get(focusAtom));
  const next = regions[(index + step + regions.length) % regions.length];
  if (next) registry.set(focusAtom, next);
}

function updateLayout(registry: AtomRegistry.AtomRegistry, change: (layout: Layout) => Layout) {
  registry.set(layoutAtom, change(registry.get(layoutAtom)));
  // Focus must stay on a region that is still on screen.
  if (!visibleRegions(registry.get(layoutAtom)).includes(registry.get(focusAtom))) {
    registry.set(focusAtom, "main");
  }
}

function resizeFocused(registry: AtomRegistry.AtomRegistry, delta: number) {
  const focus = registry.get(focusAtom);
  updateLayout(registry, (layout) => {
    if (focus === "sidebar") {
      return { ...layout, sidebarWidth: Math.max(MIN_REGION_WIDTH, layout.sidebarWidth + delta) };
    }
    if (focus === "panel") {
      return { ...layout, panelWidth: Math.max(MIN_REGION_WIDTH, layout.panelWidth + delta) };
    }
    return layout;
  });
}

const noOverlay = ({ overlay }: { readonly overlay: string | null }) => overlay === null;

export const coreFeature: TuiFeature = {
  id: "core",
  commands: [
    { id: "app.quit", title: "Quit", run: ({ exit }) => exit() },
    {
      id: "workspace.focusNext",
      title: "Focus next region",
      run: ({ registry }) => moveFocus(registry, 1),
    },
    {
      id: "workspace.focusPrevious",
      title: "Focus previous region",
      run: ({ registry }) => moveFocus(registry, -1),
    },
    {
      id: "sidebar.toggle",
      title: "Toggle sidebar",
      run: ({ registry }) =>
        updateLayout(registry, (layout) => ({ ...layout, sidebarVisible: !layout.sidebarVisible })),
    },
    {
      id: "core.help",
      title: "Toggle keybinding help",
      run: ({ registry }) =>
        updateLayout(registry, (layout) => ({
          ...layout,
          panel: layout.panel === "core.help" ? null : "core.help",
        })),
    },
    {
      id: "rightPanel.close",
      title: "Close right panel",
      run: ({ registry }) => updateLayout(registry, (layout) => ({ ...layout, panel: null })),
    },
    {
      id: "core.grow",
      title: "Widen focused region",
      run: ({ registry }) => resizeFocused(registry, RESIZE_STEP),
    },
    {
      id: "core.shrink",
      title: "Narrow focused region",
      run: ({ registry }) => resizeFocused(registry, -RESIZE_STEP),
    },
    {
      id: "core.closeOverlay",
      title: "Close overlay",
      run: ({ registry }) => registry.set(overlayAtom, null),
    },
  ],
  keybindings: [
    { key: "ctrl+c", command: "app.quit" },
    { key: "ctrl+q", command: "app.quit" },
    { key: "escape", command: "core.closeOverlay", when: ({ overlay }) => overlay !== null },
    { key: "tab", command: "workspace.focusNext", when: noOverlay },
    { key: "shift+tab", command: "workspace.focusPrevious", when: noOverlay },
    { key: "mod+b", command: "sidebar.toggle", when: noOverlay },
    { key: "?", command: "core.help", when: noOverlay },
    { key: "mod+w", command: "rightPanel.close", when: noOverlay },
    { key: "alt+arrowright", command: "core.grow", when: noOverlay },
    { key: "alt+arrowleft", command: "core.shrink", when: noOverlay },
  ],
  panels: [{ id: "core.help", title: "Keys", component: HelpPanel }],
};
