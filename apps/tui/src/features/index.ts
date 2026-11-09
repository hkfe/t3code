import type { TuiFeature } from "../app/feature.ts";
import { commandPaletteFeature } from "./command-palette/index.ts";
import { connectionFeature } from "./connection/index.ts";
import { coreFeature } from "./core/index.tsx";
import { requestsFeature } from "./requests/index.tsx";
import { sidebarFeature } from "./sidebar/index.ts";
import { threadActionsFeature } from "./thread-actions/index.ts";
import { threadViewFeature } from "./thread-view/index.ts";

/** Every feature, one line each. Earlier features win keybinding ties. */
export const features: ReadonlyArray<TuiFeature> = [
  coreFeature,
  connectionFeature,
  sidebarFeature,
  threadViewFeature,
  commandPaletteFeature,
  requestsFeature,
  threadActionsFeature,
];
