import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { AtomRegistry } from "effect/reactivity";
import { Box, Text, useWindowSize } from "ink";
import type { ComponentType } from "react";

import {
  focusAtom,
  layoutAtom,
  MIN_REGION_WIDTH,
  overlayAtom,
  routeAtom,
  type Region,
} from "../state/ui.ts";
import { theme } from "../theme/theme.ts";
import type { TuiFeature, TuiViewProps } from "./feature.ts";
import { KeyRouter } from "./input.tsx";
import { buildShellRegistry, ShellRegistryContext, useShellRegistry } from "./registry.ts";

const STATUS_BAR_ROWS = 1;
// Round border (1 cell each side) plus 1 cell of horizontal padding.
const FRAME_X = 4;
const FRAME_Y = 2;

function RegionFrame(props: {
  readonly region: Region;
  readonly width?: number;
  readonly height: number;
  readonly title?: string;
  readonly component: ComponentType<TuiViewProps> | null;
}) {
  const focused = useAtomValue(focusAtom) === props.region;
  const Component = props.component;
  const innerHeight = Math.max(0, props.height - FRAME_Y - (props.title ? 1 : 0));
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={focused ? theme.borderFocused : theme.border}
      paddingX={1}
      height={props.height}
      {...(props.width === undefined
        ? { flexGrow: 1, flexShrink: 1 }
        : { width: props.width, flexShrink: 0 })}
      overflow="hidden"
    >
      {props.title && (
        <Text color={theme.textMuted} bold>
          {props.title}
        </Text>
      )}
      {Component && (
        <Component
          focused={focused}
          width={Math.max(0, (props.width ?? MIN_REGION_WIDTH) - FRAME_X)}
          height={innerHeight}
        />
      )}
    </Box>
  );
}

function StatusBar({ width }: { readonly width: number }) {
  const { statusItems } = useShellRegistry();
  const focus = useAtomValue(focusAtom);
  return (
    <Box width={width} height={STATUS_BAR_ROWS} paddingX={1} justifyContent="space-between" gap={2}>
      <Box gap={2} flexShrink={1}>
        <Text color={theme.accent}>t3</Text>
        <Text color={theme.textFaint}>{focus} · ? keys · tab focus</Text>
        {statusItems
          .filter((item) => item.align === "left")
          .map((item) => (
            <item.component key={item.id} />
          ))}
      </Box>
      <Box gap={2} flexShrink={1}>
        {statusItems
          .filter((item) => item.align === "right")
          .map((item) => (
            <item.component key={item.id} />
          ))}
      </Box>
    </Box>
  );
}

function Shell() {
  const registry = useShellRegistry();
  const { columns, rows } = useWindowSize();
  const layout = useAtomValue(layoutAtom);
  const route = useAtomValue(routeAtom);
  const bodyHeight = Math.max(FRAME_Y + 1, rows - STATUS_BAR_ROWS);
  const panel = layout.panel === null ? undefined : registry.panels.get(layout.panel);
  // Side regions give way so the main pane keeps at least MIN_REGION_WIDTH columns.
  const room = Math.max(0, columns - MIN_REGION_WIDTH - FRAME_X);
  const sidebarWidth = layout.sidebarVisible ? Math.min(layout.sidebarWidth, room) : 0;
  const panelWidth = panel ? Math.min(layout.panelWidth, Math.max(0, room - sidebarWidth)) : 0;
  const mainWidth = columns - sidebarWidth - panelWidth;
  const overlay = useOverlay();

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {overlay ?? (
        <Box height={bodyHeight}>
          {sidebarWidth > 0 && (
            <RegionFrame
              region="sidebar"
              width={sidebarWidth}
              height={bodyHeight}
              title="Threads"
              component={registry.sidebar}
            />
          )}
          <RegionFrame
            region="main"
            width={mainWidth}
            height={bodyHeight}
            component={registry.views.get(route.view)?.component ?? null}
          />
          {panel && panelWidth > 0 && (
            <RegionFrame
              region="panel"
              width={panelWidth}
              height={bodyHeight}
              title={panel.title}
              component={panel.component}
            />
          )}
        </Box>
      )}
      <StatusBar width={columns} />
    </Box>
  );
}

function useOverlay() {
  const { overlays } = useShellRegistry();
  const { columns, rows } = useWindowSize();
  const id = useAtomValue(overlayAtom);
  const overlay = id === null ? undefined : overlays.get(id);
  if (!overlay) return null;
  return <overlay.component focused width={columns} height={rows - STATUS_BAR_ROWS} />;
}

export function App(props: {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly features: ReadonlyArray<TuiFeature>;
}) {
  const shell = buildShellRegistry(props.features);
  return (
    <RegistryContext.Provider value={props.registry}>
      <ShellRegistryContext.Provider value={shell}>
        <KeyRouter bindings={shell.keybindings} commands={shell.commands}>
          <Shell />
        </KeyRouter>
      </ShellRegistryContext.Provider>
    </RegistryContext.Provider>
  );
}
