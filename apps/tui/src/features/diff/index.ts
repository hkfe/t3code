import type { TuiFeature } from "../../app/feature.ts";
import { layoutAtom, routeAtom } from "../../state/ui.ts";
import { CHANGES_VIEW, ChangesView } from "./ChangesView.tsx";
import { CodePanel } from "./CodePanel.tsx";

const CODE_PANEL = "diff.code";

export const diffFeature: TuiFeature = {
  id: "diff",
  commands: [
    {
      id: "diff.toggle",
      title: "Toggle thread changes",
      run: ({ registry }) => {
        const route = registry.get(routeAtom);
        if (route.thread === null) return;
        registry.set(routeAtom, {
          ...route,
          view: route.view === CHANGES_VIEW ? "thread" : CHANGES_VIEW,
        });
      },
    },
    {
      id: "diff.codePanel",
      title: "Toggle pull request code",
      run: ({ registry }) => {
        const layout = registry.get(layoutAtom);
        registry.set(layoutAtom, {
          ...layout,
          panel: layout.panel === CODE_PANEL ? null : CODE_PANEL,
        });
      },
    },
  ],
  keybindings: [{ key: "ctrl+v", command: "diff.toggle", when: ({ overlay }) => overlay === null }],
  views: [{ id: CHANGES_VIEW, component: ChangesView }],
  panels: [{ id: CODE_PANEL, title: "Code", component: CodePanel }],
};
