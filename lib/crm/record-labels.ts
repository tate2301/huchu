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

export const DEAL_STATUS_OPTIONS = [
  { value: "OPEN", label: "Open" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
] as const satisfies readonly FilterOption[];

export const FORECAST_OPTIONS = [
  { value: "PIPELINE", label: "Pipeline" },
  { value: "BEST_CASE", label: "Best case" },
  { value: "COMMIT", label: "Commit" },
  { value: "CLOSED", label: "Closed" },
] as const satisfies readonly FilterOption[];

/** A lead's stages, in the order the work runs. */
export const LEAD_STAGE_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUALIFIED", label: "Qualified" },
  { value: "SITE_VISIT", label: "Site Visit" },
  { value: "QUOTED", label: "Quoted" },
  { value: "INVOICED", label: "Invoiced" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
] as const satisfies readonly FilterOption[];

/** How a lead arrived. The same words as lead sources and insights. */
export const LEAD_CHANNEL_OPTIONS = [
  { value: "MANUAL", label: "Rep entered" },
  { value: "WEB_FORM", label: "Web form" },
  { value: "WEBHOOK", label: "Integration" },
  { value: "SOCIAL", label: "Social media" },
  { value: "ADS", label: "Paid ads" },
  { value: "REFERRAL", label: "Referral" },
  { value: "OTHER", label: "Other" },
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
