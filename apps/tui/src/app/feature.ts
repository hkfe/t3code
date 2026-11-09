import type { AtomRegistry } from "effect/reactivity";
import type { ComponentType } from "react";

import type { Region } from "../state/ui.ts";

export interface CommandContext {
  readonly registry: AtomRegistry.AtomRegistry;
  readonly exit: () => void;
}

export interface KeyContext {
  readonly focus: Region;
  readonly overlay: string | null;
}

/**
 * Use the id from `KeybindingCommand` in @t3tools/contracts when the web app has the same
 * action (`commandPalette.toggle`, `thread.next`). Otherwise prefix it with the feature id.
 */
export interface TuiCommand {
  readonly id: string;
  readonly title: string;
  readonly run: (context: CommandContext) => void;
}

/** `key` uses the web keybinding syntax (`ctrl+k`, `shift+tab`, `alt+arrowleft`); `mod` is ctrl. */
export interface TuiKeybinding {
  readonly key: string;
  readonly command: string;
  readonly when?: (context: KeyContext) => boolean;
}

/** Inner size of the region in cells, after its border. */
export interface TuiViewProps {
  readonly focused: boolean;
  readonly width: number;
  readonly height: number;
}

export interface TuiView {
  readonly id: string;
  readonly component: ComponentType<TuiViewProps>;
}

/** Sits under a main view, inside its frame; the view gets the rows left over. */
export interface TuiViewFooter {
  readonly id: string;
  /** Id of the main view it belongs to. */
  readonly view: string;
  readonly component: ComponentType<TuiViewProps>;
}

export interface TuiStatusItem {
  readonly id: string;
  readonly align: "left" | "right";
  readonly component: ComponentType;
}

/** Everything a feature adds to the shell. Register it once in src/features/index.ts. */
export interface TuiFeature {
  readonly id: string;
  readonly commands?: ReadonlyArray<TuiCommand>;
  readonly keybindings?: ReadonlyArray<TuiKeybinding>;
  /** The left sidebar body. Exactly one feature provides it. */
  readonly sidebar?: TuiView["component"];
  /** Main-pane views, picked by `routeAtom.view`. */
  readonly views?: ReadonlyArray<TuiView>;
  readonly footers?: ReadonlyArray<TuiViewFooter>;
  /** Right-panel views, picked by `layoutAtom.panel`. */
  readonly panels?: ReadonlyArray<TuiView & { readonly title: string }>;
  /** Full-screen layers, picked by `overlayAtom`. */
  readonly overlays?: ReadonlyArray<TuiView>;
  readonly statusItems?: ReadonlyArray<TuiStatusItem>;
}
