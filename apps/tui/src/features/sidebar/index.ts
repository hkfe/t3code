import type { TuiFeature } from "../../app/feature.ts";
import { Sidebar } from "./Sidebar.tsx";

export const sidebarFeature: TuiFeature = {
  id: "sidebar",
  sidebar: Sidebar,
};
