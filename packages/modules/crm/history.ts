/**
 * Record history — who changed what, from what, to what, and when.
 *
 * Stored as CrmActivity rows of type SYSTEM with a structured metadata
 * payload, rather than a separate table. The timeline and the history tab are
 * then the same data filtered differently, so a stage change shows up in both
 * without being written twice.
 *
 * Only meaningful fields are recorded. Notes and free text churn constantly
 * and would drown the changes that matter.
 */
import type { Prisma } from "@corelithzw/db";

// Only the delegate this module actually uses. Keeping this narrow is
// load-bearing for typecheck time: the previous
// `Prisma.TransactionClient | { crmActivity: ... }` union made every
// `db.crmActivity.create(...)` call check against BOTH union arms, and
// TransactionClient is the whole generated client surface (~12s of check time
// for this one file). TransactionClient is structurally assignable to this
// shape, so callers pass either without change.
type Db = { crmActivity: Prisma.CrmActivityDelegate };

export type HistoryEntity = "PERSON" | "COMPANY" | "DEAL" | "SITE" | "LEAD";

export type FieldChange = {
  field: string;
  label: string;
  from: unknown;
  to: unknown;
};

/** Human labels for the fields worth recording. */
const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  fullName: "Name",
  name: "Name",
  title: "Title",
  jobTitle: "Job title",
  email: "Email",
  phone: "Phone",
  contactType: "Contact type",
  companyType: "Company type",
  accountStatus: "Account status",
  clientId: "Company",
  parentClientId: "Parent company",
  assignedToId: "Owner",
  primaryContactId: "Primary contact",
  siteId: "Site",
  stageId: "Stage",
  pipelineId: "Pipeline",
  status: "Status",
  value: "Value",
  currency: "Currency",
  probability: "Probability",
  forecastCategory: "Forecast category",
  expectedCloseDate: "Expected close date",
  lostReason: "Lost reason",
  registrationNumber: "Registration number",
  taxNumber: "Tax number",
  website: "Website",
  industry: "Industry",
  addressLine: "Address",
  city: "City",
  archivedAt: "Archived",
};

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

function normalise(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

/** Which of the watched fields actually moved. */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const from = normalise(before[field]);
    const to = normalise(after[field]);
    if (JSON.stringify(from) === JSON.stringify(to)) continue;
    changes.push({ field, label: fieldLabel(field), from, to });
  }
  return changes;
}

const ENTITY_KEYS: Record<HistoryEntity, "personId" | "clientId" | "dealId" | "leadId" | null> = {
  PERSON: "personId",
  COMPANY: "clientId",
  DEAL: "dealId",
  LEAD: "leadId",
  // Sites have no activity foreign key; their history rides on metadata only.
  SITE: null,
};

/**
 * Write a history entry for whatever changed. A no-op when nothing did, so
 * callers can invoke it unconditionally after an update.
 */
export async function recordFieldChanges(
  db: Db,
  params: {
    companyId: string;
    userId: string;
    entity: HistoryEntity;
    recordId: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    fields: string[];
  },
): Promise<FieldChange[]> {
  const changes = diffFields(params.before, params.after, params.fields);
  if (changes.length === 0) return [];

  const foreignKey = ENTITY_KEYS[params.entity];
  const subject =
    changes.length === 1
      ? `${changes[0].label} changed`
      : `${changes.length} fields changed`;

  await db.crmActivity.create({
    data: {
      companyId: params.companyId,
      type: "SYSTEM",
      ...(foreignKey ? { [foreignKey]: params.recordId } : {}),
      subject,
      metadata: {
        kind: "FIELD_CHANGE",
        entity: params.entity,
        recordId: params.recordId,
        changes: changes as unknown as Prisma.InputJsonValue,
      },
      createdById: params.userId,
    },
  });

  return changes;
}

/** Render a change the way the history tab shows it. */
export function describeChange(change: FieldChange): string {
  const from = change.from === null || change.from === "" ? "empty" : String(change.from);
  const to = change.to === null || change.to === "" ? "empty" : String(change.to);
  return `${change.label}: ${from} → ${to}`;
}

/** Whether an activity row is a history entry rather than a logged interaction. */
export function isHistoryActivity(activity: { type: string; metadata: unknown }): boolean {
  if (activity.type !== "SYSTEM" && activity.type !== "STAGE_CHANGE") return false;
  const metadata = activity.metadata as { kind?: string } | null;
  return activity.type === "STAGE_CHANGE" || metadata?.kind === "FIELD_CHANGE";
}
