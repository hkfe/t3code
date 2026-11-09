import type { TuiFeature } from "../../app/feature.ts";
import { toastAtom } from "../../state/toast.ts";
import { focusAtom, routeAtom } from "../../state/ui.ts";
import { NotificationStatus } from "./NotificationStatus.tsx";
import { OPEN_THREAD_KEY } from "./threadNotifications.ts";

export const notificationsFeature: TuiFeature = {
  id: "notifications",
  commands: [
    {
      id: "notifications.openThread",
      title: "Open the thread of the last notification",
      run: ({ registry }) => {
        const thread = registry.get(toastAtom)?.thread;
        if (!thread) return;
        registry.set(toastAtom, null);
        registry.set(routeAtom, { view: "thread", thread });
        registry.set(focusAtom, "main");
      },
    },
  ],
  keybindings: [
    {
      key: OPEN_THREAD_KEY,
      command: "notifications.openThread",
      when: ({ overlay }) => overlay === null,
    },
  ],
  statusItems: [{ id: "notifications.status", align: "left", component: NotificationStatus }],
};
