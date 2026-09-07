import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Maintenance: work orders, equipment, breakdowns and the schedule. An add-on. Data only.
 */
export const manifest: ModuleManifest = {
  id: "maintenance",
  requires: ["stock", "people", "documents", "notifications", "books"],
  notifications: {
    viewPaths: {
      WORK_ORDER: "/maintenance/work-orders?workOrderId={id}",
    },
  },
};
