import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Maintenance: work orders, equipment, breakdowns and the schedule.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "maintenance",
  notifications: {
    viewPaths: {
      WORK_ORDER: "/maintenance/work-orders?workOrderId={id}",
    },
  },
};
