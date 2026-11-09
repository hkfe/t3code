import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";

export type Region = "sidebar" | "main" | "panel";

/** `view` names a registered main view; `thread` is the thread it shows, if any. */
export interface Route {
  readonly view: string;
  readonly thread: ScopedThreadRef | null;
}

export interface Layout {
  readonly sidebarVisible: boolean;
  readonly sidebarWidth: number;
  /** Id of the open right panel, or null when closed. */
  readonly panel: string | null;
  readonly panelWidth: number;
}

export const MIN_REGION_WIDTH = 16;

export const routeAtom = Atom.make<Route>({ view: "home", thread: null }).pipe(Atom.keepAlive);
export const focusAtom = Atom.make<Region>("sidebar").pipe(Atom.keepAlive);
/** Id of the open overlay (palette, switcher...). It takes every key first. */
export const overlayAtom = Atom.make<string | null>(null).pipe(Atom.keepAlive);
export const layoutAtom = Atom.make<Layout>({
  sidebarVisible: true,
  sidebarWidth: 36,
  panel: null,
  panelWidth: 48,
}).pipe(Atom.keepAlive);

/** Regions that are on screen, in focus order. */
export function visibleRegions(layout: Layout): ReadonlyArray<Region> {
  return [
    ...(layout.sidebarVisible ? (["sidebar"] as const) : []),
    "main",
    ...(layout.panel !== null ? (["panel"] as const) : []),
  ];
}
