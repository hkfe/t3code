import { Text } from "ink";

import { useRegionInput } from "../../app/input.tsx";
import { useShellRegistry } from "../../app/registry.ts";
import { theme } from "../../theme/theme.ts";
import { features } from "../index.ts";
import { useListCursor } from "../thread-actions/ui.tsx";
import { Row, SectionBody, type SectionProps } from "./SettingsOverlay.tsx";

/** Read-only: every TUI keybinding with its command and the feature that adds it. */
export function KeysSection({ height }: SectionProps) {
  const { commands } = useShellRegistry();
  const bindings = features.flatMap((feature) =>
    (feature.keybindings ?? []).map((binding) => ({ ...binding, feature: feature.id })),
  );
  const [cursor, move] = useListCursor(bindings.length);
  useRegionInput("overlay", move);
  const rows = bindings.map((binding, index) => (
    <Row key={`${binding.key}:${binding.command}`} selected={index === cursor}>
      <Text color={theme.accent}>{binding.key.padEnd(16)}</Text>
      <Text color={theme.text} wrap="truncate">
        {commands.get(binding.command)?.title ?? binding.command}
      </Text>
      <Text color={theme.textFaint}>{binding.feature}</Text>
    </Row>
  ));
  return (
    <SectionBody
      height={height}
      cursor={cursor}
      rows={rows}
      footer={
        <Text color={theme.textFaint} wrap="truncate">
          Changing TUI keys is planned. The palette (ctrl+k) runs every command.
        </Text>
      }
      hint="↑↓ move · esc close"
    />
  );
}
