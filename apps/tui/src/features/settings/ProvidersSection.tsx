import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { ServerProvider, ServerProviderState } from "@t3tools/contracts";
import { useContext, useState } from "react";

import { Text } from "../../app/text.tsx";
import { useRegionInput } from "../../app/input.tsx";
import { isKey } from "../../app/keys.ts";
import { serverEnvironment } from "../../state/settings.ts";
import { theme } from "../../theme/theme.ts";
import { runCommand } from "../thread-actions/actions.ts";
import { useListCursor } from "../thread-actions/ui.tsx";
import { Row, SectionBody, type SectionProps } from "./SettingsOverlay.tsx";

const STATUS_COLOR: Record<ServerProviderState, string> = {
  ready: theme.success,
  warning: theme.warning,
  error: theme.danger,
  disabled: theme.textFaint,
};

function statusText(provider: ServerProvider): string {
  if (!provider.enabled) return "off";
  const auth = provider.auth.status === "unauthenticated" ? " · signed out" : "";
  return `${provider.status}${auth}`;
}

/** Enabled state and health of each provider instance; space turns one on or off. */
export function ProvidersSection({ environmentId, height }: SectionProps) {
  const registry = useContext(RegistryContext);
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const settings = useAtomValue(serverEnvironment.settingsValueAtom(environmentId));
  const providers = config?.providers ?? [];
  const canManage = useAtomValue(
    serverEnvironment.mutateProviderInstance.permissionAtom(environmentId, {
      patch: { providerInstances: {} },
    }),
  );
  const [cursor, move] = useListCursor(providers.length);
  const [error, setError] = useState<string | null>(null);
  const provider = providers[cursor];

  useRegionInput("overlay", (press) => {
    if (move(press)) return true;
    if (!(isKey(press, "space") || isKey(press, "enter")) || !provider || !canManage) return false;
    const instance = settings?.providerInstances?.[provider.instanceId] ?? {
      driver: provider.driver,
    };
    setError(null);
    void runCommand(registry, serverEnvironment.mutateProviderInstance, {
      environmentId,
      input: {
        patch: {},
        providerInstanceMutation: {
          operation: "upsert",
          instanceId: provider.instanceId,
          instance: { ...instance, enabled: !provider.enabled },
        },
      },
    }).then(setError);
    return true;
  });

  const rows = providers.map((entry, index) => (
    <Row key={entry.instanceId} selected={index === cursor}>
      <Text color={theme.accent}>{entry.enabled ? "[x]" : "[ ]"}</Text>
      <Text color={theme.text} wrap="truncate">
        {entry.displayName ?? entry.driver}
      </Text>
      <Text color={entry.enabled ? STATUS_COLOR[entry.status] : theme.textFaint}>
        {statusText(entry)}
      </Text>
      {entry.enabled && entry.message ? (
        <Text color={theme.textFaint} wrap="truncate">
          {entry.message}
        </Text>
      ) : null}
    </Row>
  ));
  return (
    <SectionBody
      height={height}
      cursor={cursor}
      rows={
        rows.length > 0
          ? rows
          : [
              <Text key="empty" color={theme.textFaint}>
                Loading providers…
              </Text>,
            ]
      }
      error={error ?? (canManage ? null : "This connection cannot manage providers.")}
      hint="↑↓ move · space turn on or off · esc close"
    />
  );
}
