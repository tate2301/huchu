import type { ModuleManifest } from "@corelithzw/platform/manifest";

/**
 * Approvals: the submit → approve → reject workflow and its audit trail, which
 * eight domains write to. A leaf: it requires no other module, and what happens
 * after an action is up to the listeners a host registers (`onApprovalAction`).
 */
export const manifest: ModuleManifest = {
  id: "workflow",
};
