import { RegistryContext, useAtomValue } from "@effect/atom-react";
import type { AtomRegistry } from "effect/reactivity";
import { Box, measureElement, Text, useWindowSize, type DOMElement } from "ink";
import { useContext, useLayoutEffect, useRef, useState, type ComponentType } from "react";

import {
  focusAtom,
  layoutAtom,
  MIN_REGION_WIDTH,
  overlayAtom,
  routeAtom,
  type Region,
} from "../state/ui.ts";
import { PaneContext, paneRoutes, panesAtom } from "../state/panes.ts";
import { toastAtom, type Toast } from "../state/toast.ts";
import { theme } from "../theme/theme.ts";
import type { TuiFeature, TuiViewFooter, TuiViewProps } from "./feature.ts";
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
  readonly footers?: ReadonlyArray<TuiViewFooter>;
}) {
  const pane = useContext(PaneContext);
  const focused = useAtomValue(focusAtom) === props.region && pane?.active !== false;
  const Component = props.component;
  const innerHeight = Math.max(0, props.height - FRAME_Y - (props.title ? 1 : 0));
  const innerWidth = Math.max(0, (props.width ?? MIN_REGION_WIDTH) - FRAME_X);
  const footers = props.footers ?? [];
  const footerRef = useRef<DOMElement>(null);
  const [footerRows, setFooterRows] = useState(0);
  // Footer height is Yoga layout output, known only after render.
  useLayoutEffect(() => {
    const rows = footerRef.current ? measureElement(footerRef.current).height : 0;
    if (rows !== footerRows) setFooterRows(rows);
  });
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
          width={innerWidth}
          height={Math.max(0, innerHeight - footerRows)}
        />
      )}
      {footers.length > 0 && (
        <Box ref={footerRef} flexDirection="column" flexShrink={0}>
          {footers.map((footer) => (
            <footer.component
              key={footer.id}
              focused={focused}
              width={innerWidth}
              height={innerHeight}
            />
          ))}
        </Box>
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

function ToastLine({ toast, width }: { readonly toast: Toast; readonly width: number }) {
  return (
    <Box width={width} height={1} paddingX={1}>
      <Text wrap="truncate">
        <Text color={theme[toast.tone]}>{toast.text}</Text>
        {toast.hint && <Text color={theme.textFaint}> · {toast.hint}</Text>}
      </Text>
    </Box>
  );
}

function Shell() {
  const registry = useShellRegistry();
  const { columns, rows } = useWindowSize();
  const layout = useAtomValue(layoutAtom);
  const toast = useAtomValue(toastAtom);
  const bodyHeight = Math.max(FRAME_Y + 1, rows - STATUS_BAR_ROWS - (toast ? 1 : 0));
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
          <MainPanes width={mainWidth} height={bodyHeight} />
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
      {toast && <ToastLine toast={toast} width={columns} />}
      <StatusBar width={columns} />
    </Box>
  );
}

function MainFrame(props: {
  readonly view: string;
  readonly width: number;
  readonly height: number;
}) {
  const registry = useShellRegistry();
  return (
    <RegionFrame
      region="main"
      width={props.width}
      height={props.height}
      component={registry.views.get(props.view)?.component ?? null}
      footers={registry.footers.filter((footer) => footer.view === props.view)}
    />
  );
}

/** One main view, or a split: each pane gets its route through `PaneContext`. */
function MainPanes(props: { readonly width: number; readonly height: number }) {
  const route = useAtomValue(routeAtom);
  const panes = useAtomValue(panesAtom);
  const routes = paneRoutes({ panes, route });
  if (routes.length === 1) return <MainFrame view={route.view} {...props} />;
  const row = panes.direction === "row";
  const share = Math.floor((row ? props.width : props.height) / routes.length);
  const last = (row ? props.width : props.height) - share * (routes.length - 1);
  return (
    <Box flexDirection={panes.direction} width={props.width} height={props.height}>
      {routes.map((paneRoute, index) => {
        const size = index === routes.length - 1 ? last : share;
        return (
          <PaneContext.Provider
            // oxlint-disable-next-line react/no-array-index-key -- a pane is its slot; two may show one thread
            key={index}
            value={{ route: paneRoute, active: index === panes.active }}
          >
            <MainFrame
              view={paneRoute.view}
              width={row ? size : props.width}
              height={row ? props.height : size}
            />
          </PaneContext.Provider>
        );
      })}
    </Box>
  );
}

function useOverlay() {
  const { overlays } = useShellRegistry();
  const { columns, rows } = useWindowSize();
  const id = useAtomValue(overlayAtom);
  const toastRows = useAtomValue(toastAtom) ? 1 : 0;
  const overlay = id === null ? undefined : overlays.get(id);
  if (!overlay) return null;
  return <overlay.component focused width={columns} height={rows - STATUS_BAR_ROWS - toastRows} />;
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
