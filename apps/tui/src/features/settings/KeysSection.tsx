import { Text } from "../../app/text.tsx";
import { useRegionInput } from "../../app/input.tsx";
import { displayKey } from "../../app/keys.ts";
import { useShellRegistry } from "../../app/registry.ts";
import { theme } from "../../theme/theme.ts";
import { useListCursor } from "../thread-actions/ui.tsx";
import { Row, SectionBody, type SectionProps } from "./SettingsOverlay.tsx";

/** Read-only: every TUI keybinding, user overrides included, with its feature. */
export function KeysSection({ height }: SectionProps) {
  const { commands, keybindings: bindings, leaderKey } = useShellRegistry();
  const [cursor, move] = useListCursor(bindings.length);
  useRegionInput("overlay", move);
  const rows = bindings.map((binding, index) => (
    <Row key={`${binding.key}:${binding.command}`} selected={index === cursor}>
      <Text color={theme.accent}>{displayKey(binding.key, leaderKey).padEnd(16)}</Text>
      <Text color={theme.text} wrap="truncate">
        {commands.get(binding.command)?.title ?? binding.command}
      </Text>
      <Text color={theme.textFaint}>{binding.custom ? "keybindings.json" : binding.feature}</Text>
    </Row>
  ));
  return (
    <SectionBody
      height={height}
      cursor={cursor}
      rows={rows}
      footer={
        <Text color={theme.textFaint} wrap="truncate">
          Change keys in keybindings.json in the TUI config dir; ? searches them.
        </Text>
      }
      hint="↑↓ move · esc close"
    />
  );
}
