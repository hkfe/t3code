import type { TuiFeature } from "../../app/feature.ts";
import { ThreadView } from "./ThreadView.tsx";

export const threadViewFeature: TuiFeature = {
  id: "thread-view",
  views: [{ id: "thread", component: ThreadView }],
};
