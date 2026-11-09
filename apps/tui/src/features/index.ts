import type { TuiFeature } from "../app/feature.ts";
import { agentOverviewFeature } from "./agent-overview/index.ts";
import { commandPaletteFeature } from "./command-palette/index.ts";
import { composerFeature } from "./composer/index.ts";
import { connectionFeature } from "./connection/index.ts";
import { coreFeature } from "./core/index.tsx";
import { messageActionsFeature } from "./message-actions/index.ts";
import { prPanelFeature } from "./pr-panel/index.ts";
import { projectsFeature } from "./projects/index.ts";
import { diffFeature } from "./diff/index.ts";
import { requestsFeature } from "./requests/index.tsx";
import { settingsFeature } from "./settings/index.ts";
import { sidebarFeature } from "./sidebar/index.ts";
import { splitPanesFeature } from "./split-panes/index.tsx";
import { switcherFeature } from "./switcher/index.ts";
import { threadActionsFeature } from "./thread-actions/index.ts";
import { notificationsFeature } from "./notifications/index.ts";
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
  messageActionsFeature,
  composerFeature,
  splitPanesFeature,
  notificationsFeature,
  agentOverviewFeature,
  switcherFeature,
  prPanelFeature,
  diffFeature,
  settingsFeature,
  projectsFeature,
];
