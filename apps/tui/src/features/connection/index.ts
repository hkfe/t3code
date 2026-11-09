import type { TuiFeature } from "../../app/feature.ts";
import { ConnectionStatus } from "./ConnectionStatus.tsx";
import { HomeView } from "./HomeView.tsx";

export const connectionFeature: TuiFeature = {
  id: "connection",
  views: [{ id: "home", component: HomeView }],
  statusItems: [{ id: "connection.status", align: "right", component: ConnectionStatus }],
};
