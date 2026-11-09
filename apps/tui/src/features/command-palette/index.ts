import type { TuiFeature } from "../../app/feature.ts";
import { overlayAtom } from "../../state/ui.ts";
import { CommandPalette } from "./CommandPalette.tsx";
import { messageSource, projectSource, threadSource } from "./sources.ts";

const OVERLAY_ID = "commandPalette";

export const commandPaletteFeature: TuiFeature = {
  id: "command-palette",
  commands: [
    {
      id: "commandPalette.toggle",
      title: "Command palette",
      run: ({ registry }) =>
        registry.set(overlayAtom, registry.get(overlayAtom) === OVERLAY_ID ? null : OVERLAY_ID),
    },
  ],
  // Web uses mod+k and Cmd+Shift+P; terminals do not send Cmd, so ctrl+p stands in.
  keybindings: [
    { key: "mod+k", command: "commandPalette.toggle" },
    { key: "mod+p", command: "commandPalette.toggle" },
  ],
  overlays: [{ id: OVERLAY_ID, component: CommandPalette }],
  paletteSources: [threadSource, projectSource, messageSource],
};
