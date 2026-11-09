import type { ReplyContextRecord } from "@t3tools/contracts";
import { create } from "zustand";

// ponytail: in memory only, a reload drops the pending reply; persist it with the draft if users miss it.
interface ComposerReplyState {
  byThreadKey: Readonly<Record<string, ReplyContextRecord>>;
  setReply: (threadKey: string, reply: ReplyContextRecord | null) => void;
}

export const useComposerReplyStore = create<ComposerReplyState>((set) => ({
  byThreadKey: {},
  setReply: (threadKey, reply) =>
    set(({ byThreadKey }) => {
      const { [threadKey]: _previous, ...rest } = byThreadKey;
      return { byThreadKey: reply ? { ...rest, [threadKey]: reply } : rest };
    }),
}));
