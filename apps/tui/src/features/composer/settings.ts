import { isReasoningSelect } from "@t3tools/client-runtime/model-traits";
import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  isProviderAvailable,
  type ModelSelection,
  type OrchestrationV2ThreadShell,
  type ProviderInteractionMode,
  type RuntimeMode,
  type SelectProviderOptionDescriptor,
  type ServerConfig,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import {
  createModelSelection,
  getProviderOptionCurrentValue,
  getProviderOptionDescriptors,
} from "@t3tools/shared/model";

import type { ComposerDraft } from "./state.ts";

/** Web's runtimeModeConfig labels, in the same order. */
export const RUNTIME_MODE_LABELS: Readonly<Record<RuntimeMode, string>> = {
  "approval-required": "Supervised",
  "auto-accept-edits": "Auto-accept edits",
  auto: "Auto",
  "full-access": "Full access",
};
const RUNTIME_MODES = Object.keys(RUNTIME_MODE_LABELS) as RuntimeMode[];

export interface ComposerSettings {
  readonly selection: ModelSelection;
  readonly provider: ServerProvider | undefined;
  readonly model: ServerProviderModel | undefined;
  readonly effort: SelectProviderOptionDescriptor | undefined;
  readonly effortValue: string | undefined;
  readonly runtimeMode: RuntimeMode;
  readonly runtimeModes: ReadonlyArray<RuntimeMode>;
  readonly interactionMode: ProviderInteractionMode;
  readonly canPlan: boolean;
}

export function effortDescriptor(
  model: ServerProviderModel | undefined,
  selection?: ModelSelection,
): SelectProviderOptionDescriptor | undefined {
  if (!model?.capabilities) return undefined;
  return getProviderOptionDescriptors({
    caps: model.capabilities,
    selections: selection?.options,
  }).find(isReasoningSelect);
}

/** What the next send uses: the draft's overrides over the thread's settings. */
export function resolveComposerSettings(
  thread: OrchestrationV2ThreadShell,
  draft: ComposerDraft,
  config: ServerConfig | null,
): ComposerSettings {
  const selection = draft.modelSelection ?? thread.modelSelection;
  const provider = config?.providers.find((entry) => entry.instanceId === selection.instanceId);
  const model = provider?.models.find((entry) => entry.slug === selection.model);
  const effort = effortDescriptor(model, selection);
  const effortValue = effort ? getProviderOptionCurrentValue(effort, selection) : undefined;
  const supported = provider?.supportedRuntimeModes ?? [];
  const runtimeModes =
    supported.length > 0 ? RUNTIME_MODES.filter((mode) => supported.includes(mode)) : RUNTIME_MODES;
  const canPlan = provider?.showInteractionModeToggle !== false;
  return {
    selection,
    provider,
    model,
    effort,
    effortValue: typeof effortValue === "string" ? effortValue : undefined,
    runtimeMode: draft.runtimeMode ?? thread.runtimeMode,
    runtimeModes,
    interactionMode: canPlan
      ? (draft.interactionMode ?? thread.interactionMode)
      : DEFAULT_PROVIDER_INTERACTION_MODE,
    canPlan,
  };
}

export function nextRuntimeMode(settings: ComposerSettings): RuntimeMode {
  const modes = settings.runtimeModes;
  return modes[(modes.indexOf(settings.runtimeMode) + 1) % modes.length] ?? settings.runtimeMode;
}

export interface ModelPickerRow {
  readonly provider: ServerProvider;
  readonly model: ServerProviderModel;
}

/** Models of enabled, available providers, filtered by provider or model name. */
export function modelPickerRows(
  config: ServerConfig | null,
  filter: string,
): ReadonlyArray<ModelPickerRow> {
  const needle = filter.trim().toLowerCase();
  return (config?.providers ?? [])
    .filter((provider) => provider.enabled && isProviderAvailable(provider))
    .flatMap((provider) => provider.models.map((model) => ({ provider, model })))
    .filter(
      ({ provider, model }) =>
        needle.length === 0 ||
        `${provider.displayName ?? provider.driver} ${model.name} ${model.slug}`
          .toLowerCase()
          .includes(needle),
    );
}

/** Picks a model, keeping the current options when the model does not change. */
export function pickModel(
  current: ModelSelection,
  row: ModelPickerRow,
  effortValue: string | undefined,
): ModelSelection {
  const sameModel =
    current.instanceId === row.provider.instanceId && current.model === row.model.slug;
  const effort = effortDescriptor(row.model);
  const options = (sameModel ? (current.options ?? []) : []).filter(
    (option) => option.id !== effort?.id,
  );
  return createModelSelection(row.provider.instanceId, row.model.slug, [
    ...options,
    ...(effort && effortValue ? [{ id: effort.id, value: effortValue }] : []),
  ]);
}
