/**
 * Merging duplicate records.
 *
 * The loser is kept, not deleted. A merge is the one operation people get
 * wrong most often, and a `mergedIntoId` pointer means the wrong call costs a
 * conversation rather than a customer's history.
 */
export type MergeableValue = string | number | boolean | string[] | Date | null | undefined;

export type FieldChoice = "SURVIVOR" | "LOSER";

export type MergeFieldPlan = {
  field: string;
  label: string;
  survivorValue: MergeableValue;
  loserValue: MergeableValue;
  /** What will be kept unless somebody says otherwise. */
  chosen: FieldChoice;
  /** True when the two records disagree and a human should look. */
  conflict: boolean;
};

function isEmpty(value: MergeableValue): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function sameValue(a: MergeableValue, b: MergeableValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|");
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/**
 * Work out, field by field, what the merged record looks like.
 *
 * The default fills gaps rather than overwriting: the survivor keeps whatever
 * it has, and only takes the loser's value where its own is blank. That way
 * the safe outcome needs no decisions, and every real disagreement is flagged.
 */
export function planMerge(
  fields: { field: string; label: string }[],
  survivor: Record<string, MergeableValue>,
  loser: Record<string, MergeableValue>,
): MergeFieldPlan[] {
  return fields.map(({ field, label }) => {
    const survivorValue = survivor[field];
    const loserValue = loser[field];
    const survivorEmpty = isEmpty(survivorValue);
    const loserEmpty = isEmpty(loserValue);

    return {
      field,
      label,
      survivorValue,
      loserValue,
      chosen: survivorEmpty && !loserEmpty ? "LOSER" : "SURVIVOR",
      conflict: !survivorEmpty && !loserEmpty && !sameValue(survivorValue, loserValue),
    };
  });
}

/** Apply the choices, dropping fields where the survivor already wins. */
export function resolveMerge(
  plans: MergeFieldPlan[],
  overrides: Record<string, FieldChoice> = {},
): Record<string, MergeableValue> {
  const result: Record<string, MergeableValue> = {};
  for (const plan of plans) {
    const choice = overrides[plan.field] ?? plan.chosen;
    if (choice === "LOSER") result[plan.field] = plan.loserValue;
  }
  return result;
}

/** Union the two records' list fields — losing a tag in a merge is a bug. */
export function mergeLists(a: string[] | null | undefined, b: string[] | null | undefined): string[] {
  return Array.from(new Set([...(a ?? []), ...(b ?? [])].map((item) => item.trim()).filter(Boolean)));
}

/**
 * A merge must not swallow a record that has already been merged, or fold a
 * record into itself — both leave a chain nothing can follow back.
 */
export function validateMergePair(
  survivor: { id: string; mergedIntoId?: string | null } | null,
  loser: { id: string; mergedIntoId?: string | null } | null,
): string | null {
  if (!survivor || !loser) return "Both records must exist";
  if (survivor.id === loser.id) return "A record can't be merged into itself";
  if (survivor.mergedIntoId) return "The record you're keeping has already been merged away";
  if (loser.mergedIntoId) return "That record has already been merged into another";
  return null;
}

export const PERSON_MERGE_FIELDS = [
  { field: "firstName", label: "First name" },
  { field: "lastName", label: "Last name" },
  { field: "jobTitle", label: "Job title" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "contactType", label: "Contact type" },
  { field: "preferredChannel", label: "Preferred channel" },
  { field: "addressLine", label: "Address" },
  { field: "city", label: "City" },
  { field: "country", label: "Country" },
  { field: "clientId", label: "Company" },
  { field: "assignedToId", label: "Owner" },
  { field: "notes", label: "Notes" },
];

export const COMPANY_MERGE_FIELDS = [
  { field: "name", label: "Name" },
  { field: "tradingName", label: "Trading name" },
  { field: "contactName", label: "Contact name" },
  { field: "email", label: "Email" },
  { field: "phone", label: "Phone" },
  { field: "website", label: "Website" },
  { field: "registrationNumber", label: "Registration number" },
  { field: "taxNumber", label: "Tax number" },
  { field: "industry", label: "Industry" },
  { field: "companyType", label: "Type" },
  { field: "billingAddress", label: "Billing address" },
  { field: "city", label: "City" },
  { field: "country", label: "Country" },
  { field: "assignedToId", label: "Owner" },
  { field: "notes", label: "Notes" },
];
