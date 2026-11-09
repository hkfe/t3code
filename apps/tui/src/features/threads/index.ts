import type { TuiFeature } from "../../app/feature.ts";
import { ThreadList } from "./ThreadList.tsx";

export const threadsFeature: TuiFeature = {
  id: "threads",
  sidebar: ThreadList,
};
