import type { TuiFeature } from "../../app/feature.ts";
import { overlayAtom } from "../../state/ui.ts";
import { SettingsOverlay } from "./SettingsOverlay.tsx";

const OVERLAY = "settings";

/** Server settings that matter in a terminal; the web Settings pages edit the rest. */
export const settingsFeature: TuiFeature = {
  id: "settings",
  commands: [
    {
      id: "settings.open",
      title: "Open settings",
      run: ({ registry }) => registry.set(overlayAtom, OVERLAY),
    },
  ],
  overlays: [{ id: OVERLAY, component: SettingsOverlay }],
};
