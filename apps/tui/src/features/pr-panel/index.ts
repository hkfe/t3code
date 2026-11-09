import type { TuiFeature } from "../../app/feature.ts";
import { focusAtom, layoutAtom } from "../../state/ui.ts";
import { ChecksTab } from "./ChecksTab.tsx";
import { PrPanel } from "./PrPanel.tsx";
import { SummaryTab } from "./SummaryTab.tsx";
import { TimelineTab } from "./TimelineTab.tsx";

const PANEL_ID = "pr-panel";

export const prPanelFeature: TuiFeature = {
  id: "pr-panel",
  commands: [
    {
      id: "pr-panel.toggle",
      title: "Toggle pull request panel",
      run: ({ registry }) => {
        const layout = registry.get(layoutAtom);
        const open = layout.panel === PANEL_ID;
        registry.set(layoutAtom, { ...layout, panel: open ? null : PANEL_ID });
        if (!open) registry.set(focusAtom, "panel");
        else if (registry.get(focusAtom) === "panel") registry.set(focusAtom, "main");
      },
    },
  ],
  keybindings: [
    { key: "ctrl+y", command: "pr-panel.toggle", when: ({ overlay }) => overlay === null },
  ],
  panels: [{ id: PANEL_ID, title: "Pull request", component: PrPanel }],
  prPanelTabs: [
    { id: "summary", title: "Summary", order: 10, component: SummaryTab },
    { id: "timeline", title: "Timeline", order: 20, component: TimelineTab },
    { id: "checks", title: "Checks", order: 30, component: ChecksTab },
  ],
};
