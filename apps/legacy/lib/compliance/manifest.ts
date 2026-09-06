import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Compliance: permits, inspections, incidents and training records.
 *
 * Ahead of the module's move: what it contributes to the kernel is declared
 * here now, so the host composes by manifests today and the move relocates
 * this file. Data only.
 */
export const manifest: ModuleManifest = {
  id: "compliance",
  notifications: {
    viewPaths: {
      INCIDENT: "/compliance/incidents?createdId={id}",
      PERMIT: "/compliance/permits?createdId={id}",
    },
  },
};
