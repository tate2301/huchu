import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Offline: the runtime that keeps screens working without a network. Which
 * screens, and how their writes sync, is what the owning modules register
 * (`registerOfflineModules`, `registerOfflineWorkflows`). Data only.
 */
export const manifest: ModuleManifest = {
  id: "offline",
};
