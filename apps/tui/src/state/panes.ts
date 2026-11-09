import { useAtomValue } from "@effect/atom-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { createContext, useContext } from "react";

import { routeAtom, type Route } from "./ui.ts";

/**
 * Split panes in the main region. `routeAtom` is always the active pane's route, so commands that
 * read it act on the focused pane. `routes[active]` is stale while that pane is active.
 * One pane (the default) is the plain single main view.
 */
export interface Panes {
  readonly routes: ReadonlyArray<Route>;
  readonly active: number;
  /** "row": side by side; "column": stacked. */
  readonly direction: "row" | "column";
}

export interface Workspace {
  readonly panes: Panes;
  readonly route: Route;
}

export const MAX_PANES = 4;

export const panesAtom = Atom.make<Panes>({ routes: [], active: 0, direction: "row" }).pipe(
  Atom.keepAlive,
);

/** Every pane's route, with the live route in the active slot. */
export function paneRoutes({ panes, route }: Workspace): ReadonlyArray<Route> {
  if (panes.routes.length <= 1) return [route];
  return panes.routes.map((pane, index) => (index === panes.active ? route : pane));
}

function focusPane(workspace: Workspace, routes: ReadonlyArray<Route>, index: number): Workspace {
  const active = (index + routes.length) % routes.length;
  return {
    panes: { ...workspace.panes, routes, active },
    route: routes[active] ?? workspace.route,
  };
}

/** Copies the active pane into a new pane after it, which takes focus (as vim's `:split`). */
export function splitPane(workspace: Workspace, direction: Panes["direction"]): Workspace {
  const routes = paneRoutes(workspace);
  if (routes.length >= MAX_PANES) return workspace;
  const at = workspace.panes.active + 1;
  const next = [...routes.slice(0, at), workspace.route, ...routes.slice(at)];
  return focusPane({ ...workspace, panes: { ...workspace.panes, direction } }, next, at);
}

/** Shows `thread` in the pane after the active one, a new one while there is room. Focus stays. */
export function openToSide(workspace: Workspace, thread: ScopedThreadRef): Workspace {
  const routes = paneRoutes(workspace);
  const at = workspace.panes.active + 1;
  const side = { view: "thread", thread };
  const next =
    routes.length < MAX_PANES
      ? [...routes.slice(0, at), side, ...routes.slice(at)]
      : routes.map((route, index) => (index === at % routes.length ? side : route));
  return focusPane(workspace, next, workspace.panes.active);
}

export function closePane(workspace: Workspace): Workspace {
  const routes = paneRoutes(workspace);
  if (routes.length <= 1) return workspace;
  const next = routes.filter((_, index) => index !== workspace.panes.active);
  return focusPane(workspace, next, Math.min(workspace.panes.active, next.length - 1));
}

export function focusNextPane(workspace: Workspace): Workspace {
  return focusPane(workspace, paneRoutes(workspace), workspace.panes.active + 1);
}

/** Swaps the active pane with the next one; focus moves with it. */
export function swapPane(workspace: Workspace): Workspace {
  const routes = [...paneRoutes(workspace)];
  if (routes.length <= 1) return workspace;
  const from = workspace.panes.active;
  const to = (from + 1) % routes.length;
  [routes[from], routes[to]] = [routes[to]!, routes[from]!];
  return focusPane(workspace, routes, to);
}

/** Set by the shell around each pane when there are several. Null: the single main view. */
export const PaneContext = createContext<{
  readonly route: Route;
  readonly active: boolean;
} | null>(null);

/** The route of the pane this view renders in. Use it instead of `routeAtom` in main views. */
export function usePaneRoute(): Route {
  const route = useAtomValue(routeAtom);
  return useContext(PaneContext)?.route ?? route;
}
