/**
 * What the record enums are called on screen, in the order they are offered.
 *
 * One copy, read by the list definitions, the filters, the exports and the
 * screens. A second copy is how a contact type ends up "Supplier" in the
 * table, "Supplier contact" in the form and "SUPPLIER_CONTACT" in the
 * spreadsheet.
 */
import type { FilterOption } from "@/lib/crm/registers/types";

export const CONTACT_TYPE_OPTIONS = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "DECISION_MAKER", label: "Decision-maker" },
  { value: "SITE_CONTACT", label: "Site contact" },
  { value: "FINANCE_CONTACT", label: "Finance contact" },
  { value: "SUPPLIER_CONTACT", label: "Supplier contact" },
  { value: "REFERRAL_PARTNER", label: "Referral partner" },
  { value: "OTHER", label: "Other" },
] as const satisfies readonly FilterOption[];

export const COMPANY_TYPE_OPTIONS = [
  { value: "CUSTOMER", label: "Customer" },
  { value: "PROSPECT", label: "Prospect" },
  { value: "SUPPLIER", label: "Supplier" },
  { value: "PARTNER", label: "Partner" },
  { value: "OTHER", label: "Other" },
] as const satisfies readonly FilterOption[];

export const ACCOUNT_STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "ON_HOLD", label: "On hold" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "BLACKLISTED", label: "Blacklisted" },
] as const satisfies readonly FilterOption[];

export const PREFERRED_CHANNEL_OPTIONS = [
  { value: "PHONE", label: "Phone" },
  { value: "EMAIL", label: "Email" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "SMS", label: "SMS" },
  { value: "IN_PERSON", label: "In person" },
] as const satisfies readonly FilterOption[];

/** An enum value's label, or the value itself when the list has no entry for it. */
export function optionLabel(
  options: readonly FilterOption[],
  value: string | null | undefined,
): string {
  if (!value) return "";
  return options.find((option) => option.value === value)?.label ?? value;
}
