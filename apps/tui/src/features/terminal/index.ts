import type { TuiFeature } from "../../app/feature.ts";
import { focusAtom, routeAtom } from "../../state/ui.ts";
import {
  closeTerminal,
  newTerminal,
  selectedTerminal,
  TERMINAL_PANEL,
  TERMINAL_VIEW,
  showTerminalPanel,
} from "./model.ts";
import { TerminalPanel, TerminalView } from "./ThreadTerminals.tsx";

export const terminalFeature: TuiFeature = {
  id: "terminal",
  commands: [
    {
      id: "terminal.toggle",
      title: "Toggle terminal panel",
      run: ({ registry }) => showTerminalPanel(registry, true),
    },
    {
      id: "terminal.openView",
      title: "Open terminal in main pane",
      run: ({ registry }) => {
        const thread = registry.get(routeAtom).thread;
        if (thread === null) return;
        registry.set(routeAtom, { view: TERMINAL_VIEW, thread });
        registry.set(focusAtom, "main");
      },
    },
    {
      id: "terminal.new",
      title: "New terminal",
      run: ({ registry }) => {
        const thread = registry.get(routeAtom).thread;
        if (thread === null) return;
        newTerminal(registry, thread);
        if (registry.get(routeAtom).view !== TERMINAL_VIEW) showTerminalPanel(registry, false);
      },
    },
    {
      id: "terminal.close",
      title: "Close terminal",
      run: ({ registry }) => {
        const thread = registry.get(routeAtom).thread;
        const terminalId = thread === null ? null : selectedTerminal(registry, thread);
        if (thread !== null && terminalId !== null) closeTerminal(registry, thread, terminalId);
      },
    },
  ],
  keybindings: [
    { key: "ctrl+z", command: "terminal.toggle", when: ({ overlay }) => overlay === null },
  ],
  views: [{ id: TERMINAL_VIEW, component: TerminalView }],
  panels: [{ id: TERMINAL_PANEL, title: "Terminal", component: TerminalPanel }],
};
