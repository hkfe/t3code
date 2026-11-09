import { Box, Text } from "ink";

import type { TuiViewProps } from "../../app/feature.ts";
import { useShellRegistry } from "../../app/registry.ts";
import { theme } from "../../theme/theme.ts";

export function HelpPanel({ height }: TuiViewProps) {
  const { keybindings, commands } = useShellRegistry();
  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {keybindings.map((binding) => (
        <Box key={`${binding.key}:${binding.command}`} gap={1}>
          <Box width={14} flexShrink={0}>
            <Text color={theme.accent}>{binding.key}</Text>
          </Box>
          <Text color={theme.text} wrap="truncate">
            {commands.get(binding.command)?.title ?? binding.command}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
