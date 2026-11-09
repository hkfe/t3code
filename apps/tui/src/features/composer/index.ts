import type { AtomRegistry } from "effect/reactivity";

import type { TuiFeature } from "../../app/feature.ts";
import { overlayAtom, routeAtom } from "../../state/ui.ts";
import { Composer } from "./Composer.tsx";
import { MODEL_PICKER_OVERLAY, ModelPicker } from "./ModelPicker.tsx";
import { nextRuntimeMode, resolveComposerSettings, type ComposerSettings } from "./settings.ts";
import {
  composerDraftAtom,
  composerServer,
  threadKey,
  turnThreadAtom,
  type ComposerDraft,
} from "./state.ts";

/** Changes the routed thread's draft settings; they go out with the next send. */
function updateSettings(
  registry: AtomRegistry.AtomRegistry,
  change: (settings: ComposerSettings) => Partial<ComposerDraft>,
) {
  const thread = registry.get(routeAtom).thread;
  if (thread === null) return;
  const shell = registry.get(turnThreadAtom(thread));
  if (!shell) return;
  const draftAtom = composerDraftAtom(threadKey(thread));
  const draft = registry.get(draftAtom);
  const config = registry.get(composerServer.configValueAtom(thread.environmentId));
  registry.set(draftAtom, { ...draft, ...change(resolveComposerSettings(shell, draft, config)) });
}

const onThread = ({ overlay }: { readonly overlay: string | null }) => overlay === null;

export const composerFeature: TuiFeature = {
  id: "composer",
  footers: [{ id: "composer", view: "thread", component: Composer }],
  overlays: [{ id: MODEL_PICKER_OVERLAY, component: ModelPicker }],
  commands: [
    {
      id: "modelPicker.toggle",
      title: "Pick model and effort",
      run: ({ registry }) =>
        registry.set(
          overlayAtom,
          registry.get(overlayAtom) === MODEL_PICKER_OVERLAY ? null : MODEL_PICKER_OVERLAY,
        ),
    },
    {
      id: "composer.mode",
      title: "Cycle runtime mode",
      run: ({ registry }) =>
        updateSettings(registry, (settings) => ({ runtimeMode: nextRuntimeMode(settings) })),
    },
    {
      id: "composer.plan",
      title: "Toggle plan mode",
      run: ({ registry }) =>
        updateSettings(registry, (settings) =>
          settings.canPlan
            ? { interactionMode: settings.interactionMode === "plan" ? "default" : "plan" }
            : {},
        ),
    },
  ],
  keybindings: [
    {
      key: "ctrl+l",
      command: "modelPicker.toggle",
      when: ({ overlay }) => overlay === null || overlay === MODEL_PICKER_OVERLAY,
    },
    { key: "ctrl+g", command: "composer.mode", when: onThread },
    { key: "ctrl+t", command: "composer.plan", when: onThread },
  ],
};
