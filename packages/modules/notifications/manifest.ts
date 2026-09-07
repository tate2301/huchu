import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Notifications: the notice itself, who receives it, and the centre that shows
 * it. What a notice is about is the owning module's business, declared in that
 * module's manifest (`notifications.viewPaths`, `notifications.approvalActions`).
 */
export const manifest: ModuleManifest = {
  id: "notifications",
};
