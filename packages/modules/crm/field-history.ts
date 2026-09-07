import type { Prisma } from "@corelithzw/db";

/**
 * Recording what changed, field by field.
 *
 * The activity feed already says "Nicolas updated the deal". That is the
 * sentence nobody needs. What somebody wants when a number looks wrong is
 * which number, what it was before, and who moved it — so this diffs an update
 * against what was there and writes one row per field that actually moved.
 *
 * Pure apart from the write, so the interesting half — what counts as a change
 * — is testable without a database.
 */

/** Fields worth remembering, per record type. */
export const TRACKED_FIELDS: Record<string, string[]> = {
  LEAD: [
    "title",
    "stage",
    "estimatedValue",
    "currency",
    "probability",
    "assignedToId",
    "source",
    "sourceChannel",
    "lostReason",
    "clientId",
  ],
  DEAL: [
    "title",
    "stageId",
    "value",
    "currency",
    "probability",
    "expectedCloseDate",
    "assignedToId",
    "forecastCategory",
    "lostReason",
    "clientId",
    "siteId",
  ],
  PERSON: [
    "firstName",
    "lastName",
    "jobTitle",
    "email",
    "phone",
    "contactType",
    "preferredChannel",
    "clientId",
    "assignedToId",
    "city",
  ],
  CLIENT: [
    "name",
    "tradingName",
    "companyType",
    "accountStatus",
    "industry",
    "email",
    "phone",
    "website",
    "city",
    "country",
    "assignedToId",
    // The column is `parentClientId`. Tracking `parentId` — the name the
    // relation reads as — matched no key in the payload and no key on the
    // record, so re-parenting a company was silently unrecorded.
    "parentClientId",
  ],
  SITE: ["name", "addressLine", "city", "country", "clientId", "primaryContactId"],
};

/** Field keys read as camelCase; people read words. */
export const FIELD_LABELS: Record<string, string> = {
  assignedToId: "Owner",
  clientId: "Company",
  siteId: "Site",
  parentId: "Parent company",
  parentClientId: "Parent company",
  primaryContactId: "Primary contact",
  stageId: "Stage",
  estimatedValue: "Value",
  expectedCloseDate: "Expected close",
  forecastCategory: "Forecast",
  sourceChannel: "Channel",
  lostReason: "Lost reason",
  contactType: "Contact type",
  preferredChannel: "Preferred channel",
  accountStatus: "Account status",
  companyType: "Company type",
  tradingName: "Trading name",
  addressLine: "Address",
  firstName: "First name",
  lastName: "Last name",
  jobTitle: "Job title",
};

export function fieldLabel(field: string): string {
  return (
    FIELD_LABELS[field] ??
    field
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (character) => character.toUpperCase())
      .trim()
  );
}

/** How a value reads in a history row. */
export function stringifyFieldValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (Array.isArray(value)) return value.length === 0 ? null : value.join(", ");
  return JSON.stringify(value);
}

export type FieldChange = { field: string; oldValue: string | null; newValue: string | null };

/**
 * Which fields actually moved.
 *
 * Only keys present in the update are considered — a PATCH that does not
 * mention a field is not a claim that it stayed the same, and treating an
 * absent key as null would record every unrelated save as wiping half the
 * record. Values are compared as their string form so `5` and `"5"` from two
 * different code paths do not read as a change nobody made.
 */
export function diffFields(
  entity: string,
  before: Record<string, unknown>,
  update: Record<string, unknown>,
): FieldChange[] {
  const tracked = new Set(TRACKED_FIELDS[entity] ?? []);
  const changes: FieldChange[] = [];

  for (const [field, rawNext] of Object.entries(update)) {
    if (!tracked.has(field)) continue;
    if (rawNext === undefined) continue;

    const oldValue = stringifyFieldValue(before[field]);
    const newValue = stringifyFieldValue(rawNext);
    if (oldValue === newValue) continue;

    changes.push({ field, oldValue, newValue });
  }

  return changes;
}

/**
 * Write the diff down.
 *
 * Takes a transaction client so the history and the change it describes land
 * together — a record that moved with no row saying so is worse than no
 * history, because it makes the history look complete.
 */
export async function recordFieldChanges(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    entity: string;
    recordId: string;
    changedById: string | null;
    before: Record<string, unknown>;
    update: Record<string, unknown>;
  },
): Promise<number> {
  const changes = diffFields(input.entity, input.before, input.update);
  if (changes.length === 0) return 0;

  await tx.crmFieldChange.createMany({
    data: changes.map((change) => ({
      companyId: input.companyId,
      entity: input.entity,
      recordId: input.recordId,
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      changedById: input.changedById,
    })),
  });

  return changes.length;
}
