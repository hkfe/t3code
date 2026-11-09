import type { TuiFeature } from "../../app/feature.ts";
import { overlayAtom } from "../../state/ui.ts";
import { AgentOverview } from "./AgentOverview.tsx";

const OVERVIEW = "agent-overview";

export const agentOverviewFeature: TuiFeature = {
  id: "agent-overview",
  commands: [
    {
      id: "agent-overview.toggle",
      title: "Agent overview",
      run: ({ registry }) =>
        registry.set(overlayAtom, registry.get(overlayAtom) === OVERVIEW ? null : OVERVIEW),
    },
  ],
  // Web uses Option+`; ctrl+x works in every terminal, alt+` only with Option as Meta.
  keybindings: ["ctrl+x", "alt+`"].map((key) => ({
    key,
    command: "agent-overview.toggle",
    when: ({ overlay }) => overlay === null || overlay === OVERVIEW,
  })),
  overlays: [{ id: OVERVIEW, component: AgentOverview }],
};
