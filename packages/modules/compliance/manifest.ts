import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Compliance: permits, inspections, incidents and training records. An add-on. Data only.
 */
export const manifest: ModuleManifest = {
  id: "compliance",
  requires: ["people", "documents", "notifications"],
  notifications: {
    viewPaths: {
      INCIDENT: "/compliance/incidents?createdId={id}",
      PERMIT: "/compliance/permits?createdId={id}",
    },
  },
};
