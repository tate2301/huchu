import type { ModuleManifest } from "@corelithzw/platform/manifest";
import { CRM_CAPABILITY_SET } from "./capabilities";

/**
 * The CRM's manifest, ahead of its move.
 *
 * What the CRM contributes to the kernel is declared here now, so the host
 * composes itself by manifests from today and the move to
 * `packages/modules/crm` is a relocation of this file, not a change to it.
 * Data only: nothing here reaches a database.
 */
export const manifest: ModuleManifest = {
  id: "crm",
  permissions: { capabilities: CRM_CAPABILITY_SET },
};
