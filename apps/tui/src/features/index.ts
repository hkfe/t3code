import type { TuiFeature } from "../app/feature.ts";
import { connectionFeature } from "./connection/index.ts";
import { coreFeature } from "./core/index.tsx";
import { threadViewFeature } from "./thread-view/index.ts";
import { threadsFeature } from "./threads/index.ts";

/** Every feature, one line each. Earlier features win keybinding ties. */
export const features: ReadonlyArray<TuiFeature> = [
  coreFeature,
  connectionFeature,
  threadsFeature,
  threadViewFeature,
];
