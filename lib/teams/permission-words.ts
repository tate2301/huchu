import type { CrmCapability } from "@/lib/crm/permissions";
import type { WorkspaceProduct } from "@prisma/client";

/**
 * A member's permissions as the boards say them (W4-2, A5): a sentence each, in the groups a person thinks in.
 * Each is one of the CRM's capabilities (`lib/crm/permissions.ts`); `allow` and `deny` finish the line on Who
 * changed what ("Tatenda allowed Simbarashe to see every deal", "Sean denied Simbarashe giving discounts").
 */
export type PermissionRowDef = {
  key: CrmCapability;
  group: string;
  label: string;
  allow: string;
  deny: string;
};

export const PERMISSION_ROWS: PermissionRowDef[] = [
  { key: "records.read", group: "Deals and clients", label: "See every deal", allow: "see every deal", deny: "seeing every deal" },
  { key: "records.edit.own", group: "Deals and clients", label: "Edit the deals they're on", allow: "edit the deals they are on", deny: "editing the deals they are on" },
  { key: "records.edit.any", group: "Deals and clients", label: "Edit any deal", allow: "edit any deal", deny: "editing any deal" },
  { key: "records.delete", group: "Deals and clients", label: "Delete deals and clients", allow: "delete deals and clients", deny: "deleting deals and clients" },
  { key: "documents.issue", group: "Quotes and invoices", label: "Make and send quotes", allow: "make and send quotes", deny: "making and sending quotes" },
  { key: "money.view_all", group: "Money", label: "See what every deal is worth", allow: "see what every deal is worth", deny: "seeing what every deal is worth" },
];

/** What a product calls the thing it sells to: Pabasa's boards say deal, Kuda Interiors' say job. */
export function noun(product: WorkspaceProduct): string {
  return product === "TENDER" ? "sale" : "deal";
}
