import type { TuiFeature } from "../../app/feature.ts";
import { overlayAtom } from "../../state/ui.ts";
import { SWITCHER_OVERLAY, Switcher } from "./Switcher.tsx";

export const switcherFeature: TuiFeature = {
  id: "switcher",
  commands: [
    {
      id: "switcher.open",
      title: "Switch thread…",
      run: ({ registry }) => registry.set(overlayAtom, SWITCHER_OVERLAY),
    },
  ],
  // Web uses Option+Tab, which terminals do not send reliably; ctrl+] is a free control key.
  keybindings: [
    { key: "ctrl+]", command: "switcher.open", when: ({ overlay }) => overlay === null },
  ],
  overlays: [{ id: SWITCHER_OVERLAY, component: Switcher }],
};
