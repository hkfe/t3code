import { useAtomValue } from "@effect/atom-react";
import {
  AVAILABLE_CONNECTION_STATE,
  connectionStatusTitle,
  presentConnectionState,
  type EnvironmentConnectionPhase,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentId } from "@t3tools/contracts";
import { Box } from "ink";
import { AsyncResult } from "effect/reactivity";

import { Text } from "../../app/text.tsx";
import { environmentCatalog } from "../../state/catalog.ts";
import { theme } from "../../theme/theme.ts";

const PHASE_COLOR: Record<EnvironmentConnectionPhase, string> = {
  available: theme.textFaint,
  offline: theme.textFaint,
  connecting: theme.warning,
  reconnecting: theme.warning,
  connected: theme.success,
  error: theme.danger,
  unsupported: theme.danger,
};

function EnvironmentStatus(props: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}) {
  const state = AsyncResult.getOrElse(
    useAtomValue(environmentCatalog.stateAtom(props.environmentId)),
    () => AVAILABLE_CONNECTION_STATE,
  );
  const connection = presentConnectionState(state);
  return (
    <Text color={PHASE_COLOR[connection.phase]} wrap="truncate">
      ● {connectionStatusTitle(connection)} · {props.label}
    </Text>
  );
}

export function ConnectionStatus() {
  const catalog = useAtomValue(environmentCatalog.catalogValueAtom);
  if (!catalog.isReady) return <Text color={theme.textFaint}>Loading connections…</Text>;
  if (catalog.entries.size === 0) return <Text color={theme.warning}>Not paired</Text>;
  return (
    <Box gap={2}>
      {[...catalog.entries.values()].map((entry) => (
        <EnvironmentStatus
          key={entry.target.environmentId}
          environmentId={entry.target.environmentId}
          label={entry.target.label}
        />
      ))}
    </Box>
  );
}
