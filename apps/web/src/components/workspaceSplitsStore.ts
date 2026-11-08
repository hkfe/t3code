import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../lib/storage";

interface WorkspaceState {
  /** Scoped thread keys, most recently viewed first. Feeds the Option+Tab switcher. */
  recent: string[];
  touch: (key: string) => void;
  /** Scoped thread keys shown as split panes beside the route thread, left to right. */
  splits: string[];
  split: (key: string) => void;
  unsplit: (key: string) => void;
  /** Swaps a split pane with the route thread, which takes the pane's place. */
  promote: (key: string, mainKey: string) => void;
}

/** Four panes at most: the route thread and three splits. */
const MAX_SPLITS = 3;

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      recent: [],
      touch: (key) =>
        set((s) =>
          s.recent[0] === key
            ? s
            : { recent: [key, ...s.recent.filter((k) => k !== key)].slice(0, 20) },
        ),
      splits: [],
      // The oldest split gives way, so a deleted thread's key never blocks a new one.
      split: (key) =>
        set((s) => ({ splits: [...s.splits.filter((k) => k !== key), key].slice(-MAX_SPLITS) })),
      unsplit: (key) => set((s) => ({ splits: s.splits.filter((k) => k !== key) })),
      promote: (key, mainKey) =>
        set((s) => ({
          splits: s.splits.filter((k) => k !== mainKey).map((k) => (k === key ? mainKey : k)),
        })),
    }),
    {
      name: "t3code:workspace-tabs:v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
    },
  ),
);

/** Opens a thread as a split pane beside the current one ("Open to the side" in the thread menu). */
export function openThreadToTheSide(ref: ScopedThreadRef) {
  useWorkspaceStore.getState().split(scopedThreadKey(ref));
}
