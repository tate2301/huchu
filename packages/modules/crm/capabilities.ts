/**
 * What each role can do in the CRM, as data.
 *
 * Pure on purpose: the manifest carries `CRM_CAPABILITY_SET`, and a manifest is
 * data the admin host may import without a line of module code — so nothing in
 * this file reaches a database. The checks that do (`can`, `canUser`, …) live
 * in `permissions.ts`, which re-exports everything here.
 */
import { hasCrmFullAccess } from "./scope";
import type { CapabilitySet } from "@corelithzw/platform/permission-catalog";

export const CRM_CAPABILITIES = [
  "records.read",
  "records.edit.own",
  "records.edit.any",
  "records.delete",
  "records.merge",
  "records.import",
  "records.export",
  "pipelines.manage",
  "fields.manage",
  "views.share",
  "tasks.assign.others",
  "documents.issue",
  "documents.approve",
  "commissions.manage",
  "settings.manage",
] as const;

export type CrmCapability = (typeof CRM_CAPABILITIES)[number];

export const CRM_CAPABILITY_LABELS: Record<CrmCapability, string> = {
  "records.read": "See the whole pipeline",
  "records.edit.own": "Edit records assigned to them",
  "records.edit.any": "Edit anybody's records",
  "records.delete": "Delete records",
  "records.merge": "Merge duplicates",
  "records.import": "Import from a file",
  "records.export": "Export to a file",
  "pipelines.manage": "Change pipelines and stages",
  "fields.manage": "Add and change custom fields",
  "views.share": "Share saved views with the team",
  "tasks.assign.others": "Assign tasks to other people",
  "documents.issue": "Issue quotes and invoices",
  "documents.approve": "Send documents for customer approval",
  "commissions.manage": "Set commission rules",
  "settings.manage": "Change CRM settings",
};

/**
 * What each permission costs to grant, in one sentence.
 *
 * An admin deciding whether to tick a box needs to know what goes wrong if
 * they tick it, and a label like "Merge duplicates" does not say that merging
 * is irreversible. These notes are the difference between a permission screen
 * somebody can use and one they guess at.
 */
export const CRM_CAPABILITY_NOTES: Record<CrmCapability, string> = {
  "records.read": "The whole pipeline, including deals they are not on.",
  "records.edit.own": "Records assigned to them, plus any unassigned record they claim.",
  "records.edit.any": "Anybody's record. History still shows who changed what.",
  "records.delete": "Removes the record and everything hanging off it.",
  "records.merge": "Folds one record into another. Not reversible.",
  "records.import": "Creates records in bulk from a spreadsheet.",
  "records.export": "Takes customer data out of the system as a file.",
  "pipelines.manage": "Adds, renames and reorders stages for everyone.",
  "fields.manage": "Adds and changes custom fields for everyone.",
  "views.share": "Publishes a saved view to the whole team.",
  "tasks.assign.others": "Puts work on somebody else's list.",
  "documents.issue": "Raises quotes and invoices against a customer.",
  "documents.approve": "Sends a document to the customer for signature.",
  "commissions.manage": "Changes what the team gets paid.",
  "settings.manage": "Everything on the CRM settings screen.",
};

/**
 * A rep sees everything and edits their own. That combination is deliberate:
 * hiding the pipeline from the people working it causes more damage than the
 * privacy it buys, but letting anyone rewrite anyone's deal loses history.
 */
export const REP_CAPABILITIES = new Set<CrmCapability>([
  "records.read",
  "records.edit.own",
  "records.export",
  "documents.issue",
  "documents.approve",
]);

export const MANAGER_CAPABILITIES = new Set<CrmCapability>(CRM_CAPABILITIES);

export function capabilitiesForRole(role: string | null | undefined): Set<CrmCapability> {
  return hasCrmFullAccess(role) ? MANAGER_CAPABILITIES : REP_CAPABILITIES;
}

/**
 * What the CRM contributes to the platform's permission catalog. Carried by the
 * CRM's manifest; the kernel never imports this file.
 *
 * Capabilities are grouped the way somebody thinks about them, not the way the
 * key happens to be spelled. "Can she delete a record" and "can she merge a
 * duplicate" belong next to each other even though one string starts with
 * `records.delete` and the other with `records.merge`.
 */
export const CRM_CAPABILITY_SET: CapabilitySet = {
  module: "crm",
  capabilities: CRM_CAPABILITIES,
  labels: CRM_CAPABILITY_LABELS,
  notes: CRM_CAPABILITY_NOTES,
  groups: {
    "records.read": "crm-records",
    "records.edit.own": "crm-records",
    "records.edit.any": "crm-records",
    "records.delete": "crm-records",
    "records.merge": "crm-records",
    "records.import": "crm-data",
    "records.export": "crm-data",
    "pipelines.manage": "crm-config",
    "fields.manage": "crm-config",
    "views.share": "crm-config",
    "tasks.assign.others": "crm-work",
    "documents.issue": "crm-documents",
    "documents.approve": "crm-documents",
    "commissions.manage": "crm-money",
    "settings.manage": "crm-config",
  },
  groupMeta: {
    "crm-records": {
      label: "CRM · Records",
      description: "Reading and changing people, companies, deals and sites.",
    },
    "crm-data": {
      label: "CRM · Moving data",
      description: "Bringing records in from a file and taking them back out.",
    },
    "crm-work": {
      label: "CRM · Work",
      description: "Tasks, follow-ups and who they land on.",
    },
    "crm-documents": {
      label: "CRM · Documents",
      description: "Quotes, invoices and sending them to a customer.",
    },
    "crm-money": {
      label: "CRM · Money",
      description: "Commission rules and what they pay out.",
    },
    "crm-config": {
      label: "CRM · Configuration",
      description: "Pipelines, fields, shared views and settings.",
    },
  },
  groupOrder: ["crm-records", "crm-documents", "crm-work", "crm-data", "crm-money", "crm-config"],
  capabilitiesForRole,
};
