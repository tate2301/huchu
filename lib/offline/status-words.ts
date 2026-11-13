import type { OfflineStatus } from "@/lib/offline/types";

/**
 * The device's state in the words the sidebar foot, the till's sync button and
 * the Device sync panel all use. One table, so a state never has two names.
 */
export const OFFLINE_STATUS_WORD: Record<OfflineStatus, string> = {
  ONLINE: "Up to date",
  OFFLINE: "Offline",
  ATTENTION: "Needs attention",
  SYNCING: "Syncing",
  PREPARING: "Getting ready to work offline",
  UPDATE_READY: "Update ready",
};
