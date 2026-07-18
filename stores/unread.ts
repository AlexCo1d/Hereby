// Unread badge state for the Message tab and its Notification / Chat sub-tabs.
//
// Holds the two counts driving the orange dots. `refresh()` re-reads them from
// the api (cheap enough to poll). Screens call refresh() after they mark
// something read; the tab layout polls on an interval so a cross-user event
// (someone replies to your note) lights the dot without a manual reload.
import { create } from "zustand";
import { api } from "../services/api";

type UnreadState = {
  /** Number of chat threads with unread messages. */
  chat: number;
  /** Number of unread notifications. */
  notifications: number;
  refresh: () => Promise<void>;
};

export const useUnread = create<UnreadState>((set) => ({
  chat: 0,
  notifications: 0,
  refresh: async () => {
    try {
      const c = await api.getUnreadCounts();
      set({ chat: c.chat, notifications: c.notifications });
    } catch {
      // Transient (offline / auth not ready) — keep the last known counts.
    }
  },
}));
