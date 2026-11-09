import type { TuiFeature } from "../../app/feature.ts";
import { MessageActions } from "./MessageActions.tsx";

export const messageActionsFeature: TuiFeature = {
  id: "message-actions",
  footers: [{ id: "message-actions", view: "thread", component: MessageActions }],
};
