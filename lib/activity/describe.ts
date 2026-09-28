/**
 * What a write says about itself, in words a person reviewing the log can use.
 *
 * Pure — no Prisma, no Node — so the log's view can import the module labels
 * and the server can import the rest.
 */

export type ActivityAction = "created" | "updated" | "deleted";

export type ActivityField = {
  name: string;
  /** The new value, as text. Absent for a relation or a hidden field. */
  value?: string;
};

export type ActivityChange = {
  /** The Prisma model, e.g. `Employee`. */
  model: string;
  action: ActivityAction;
  recordId: string | null;
  /** The record's name, title, code or number — whatever it is known by. */
  label: string | null;
  /** Update only: the fields the write set. */
  fields?: ActivityField[];
  /** Bulk writes: how many rows. */
  count?: number;
};

/* ---------------------------------------------------------------------- *
 * Which writes count
 * ---------------------------------------------------------------------- */

/**
 * Tables that are bookkeeping, not somebody's work: the logs themselves,
 * sessions, sequences, caches, locks, queues and delivery records. A change to
 * one of these is a side effect of a change that is already being logged.
 */
const IGNORED_MODELS = new Set([
  "Account",
  "AccountingIntegrationEvent",
  "ContractEnforcementEvent",
  "CrmActivity",
  "CrmFacebookLeadEvent",
  "CrmFieldChange",
  "CrmTemplateEvent",
  "DocumentRenderJob",
  "EditingLock",
  "GlobalIdSequence",
  "GoldImportSnapshot",
  "GoldInventoryEvent",
  "GoldSpotPriceCache",
  "IdSequence",
  "Notification",
  "NotificationRecipient",
  "PaymentWebhookEvent",
  "PlatformAuditEvent",
  "ProvisioningEvent",
  "Session",
  "SupportSession",
  "TenantSloMetricSnapshot",
  "VerificationToken",
  "WebPushSubscription",
]);

const OPERATION_ACTIONS: Record<string, ActivityAction> = {
  create: "created",
  createMany: "created",
  createManyAndReturn: "created",
  update: "updated",
  updateMany: "updated",
  updateManyAndReturn: "updated",
  upsert: "updated",
  delete: "deleted",
  deleteMany: "deleted",
};

/* ---------------------------------------------------------------------- *
 * Fields
 * ---------------------------------------------------------------------- */

/** Set by the database or the ORM on every write; saying so is noise. */
const BOOKKEEPING_FIELDS = new Set(["id", "createdAt", "updatedAt", "companyId", "version"]);

/** Recorded by name only — the value never reaches the log. */
const SECRET_FIELD = /(password|secret|token|hash|otp|apikey|privatekey|pin$)/i;

const MAX_FIELDS = 20;
const MAX_VALUE_LENGTH = 80;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function truncate(text: string) {
  return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH - 1)}…` : text;
}

/**
 * A written value as text, or undefined when it has none worth showing: a
 * nested relation write (`{ connect: … }`), a JSON blob, a list.
 */
function describeValue(value: unknown): string | undefined {
  if (value === null) return "empty";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return truncate(value);
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (isPlainObject(value)) {
    // Prisma's atomic number operations.
    if ("set" in value) return describeValue(value.set);
    if ("increment" in value) return `+${String(value.increment)}`;
    if ("decrement" in value) return `−${String(value.decrement)}`;
    return undefined;
  }
  // `Prisma.Decimal` and anything else that knows how to print itself.
  if (typeof value === "object" && value !== null && "toFixed" in value) {
    return String(value);
  }
  return undefined;
}

export function describeFields(data: unknown): ActivityField[] {
  if (!isPlainObject(data)) return [];
  const fields: ActivityField[] = [];
  for (const [name, raw] of Object.entries(data)) {
    if (raw === undefined || BOOKKEEPING_FIELDS.has(name)) continue;
    if (fields.length === MAX_FIELDS) break;
    if (SECRET_FIELD.test(name)) {
      fields.push({ name });
      continue;
    }
    const value = describeValue(raw);
    fields.push(value === undefined ? { name } : { name, value });
  }
  return fields;
}

/* ---------------------------------------------------------------------- *
 * Record labels
 * ---------------------------------------------------------------------- */

const NAME_KEYS = ["name", "title", "displayName", "fullName", "legalName", "subject", "label"];
const NUMBER_KEY = /(number|code|reference|ref|no)$/i;

/** What the record is called, read off the row the write returned. */
export function describeRecordLabel(row: unknown): string | null {
  if (!isPlainObject(row)) return null;

  for (const key of NAME_KEYS) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return truncate(value.trim());
  }

  const first = typeof row.firstName === "string" ? row.firstName.trim() : "";
  const last = typeof row.lastName === "string" ? row.lastName.trim() : "";
  if (first || last) return truncate(`${first} ${last}`.trim());

  for (const [key, value] of Object.entries(row)) {
    if (NUMBER_KEY.test(key) && typeof value === "string" && value.trim()) {
      return truncate(value.trim());
    }
  }

  if (typeof row.email === "string" && row.email.trim()) return truncate(row.email.trim());
  return null;
}

function describeRecordId(row: unknown): string | null {
  if (!isPlainObject(row)) return null;
  const id = row.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : null;
}

/* ---------------------------------------------------------------------- *
 * The change
 * ---------------------------------------------------------------------- */

/**
 * One Prisma write as a change, or null when it is not one the log keeps.
 *
 * Reads only what the write already has in hand — its arguments and the row it
 * returned — so recording costs no query.
 */
export function describeChange(args: {
  model: string | undefined;
  operation: string;
  queryArgs: unknown;
  result: unknown;
}): ActivityChange | null {
  const { model, operation, queryArgs, result } = args;
  if (!model || IGNORED_MODELS.has(model)) return null;
  const action = OPERATION_ACTIONS[operation];
  if (!action) return null;

  const input = isPlainObject(queryArgs) ? queryArgs : {};

  if (operation.endsWith("Many") || operation.endsWith("ManyAndReturn")) {
    const count = Array.isArray(result)
      ? result.length
      : isPlainObject(result) && typeof result.count === "number"
        ? result.count
        : 0;
    if (count === 0) return null;
    return {
      model,
      action,
      recordId: null,
      label: null,
      count,
      ...(action === "updated" ? { fields: describeFields(input.data) } : {}),
    };
  }

  const change: ActivityChange = {
    model,
    action,
    recordId: describeRecordId(result),
    label: describeRecordLabel(result),
  };
  if (operation === "update") change.fields = describeFields(input.data);
  if (operation === "upsert") change.fields = describeFields(input.update);
  return change;
}

/* ---------------------------------------------------------------------- *
 * Words
 * ---------------------------------------------------------------------- */

/** `SchoolFeeInvoice` → `School fee invoice`. */
export function humanizeModel(model: string): string {
  const words = model
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, index) =>
      index === 0
        ? word[0]!.toUpperCase() + word.slice(1).toLowerCase()
        : /^[A-Z0-9]+$/.test(word) && word.length > 1
          ? word
          : word.toLowerCase(),
    )
    .join(" ");
}

/** `jobGradeId` → `Job grade`. */
export function humanizeField(name: string): string {
  return humanizeModel(name.replace(/Id$/, ""));
}

/** `Employee` + `updated` → `EMPLOYEE.UPDATED`, the shape `activityToneFor` reads. */
export function activityEventType(change: Pick<ActivityChange, "model" | "action">): string {
  const entity = change.model
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
  return `${entity}.${change.action.toUpperCase()}`;
}

const ACTION_VERBS: Record<ActivityAction, string> = {
  created: "Created",
  updated: "Updated",
  deleted: "Deleted",
};

export function describeAction(action: ActivityAction): string {
  return ACTION_VERBS[action];
}

/* ---------------------------------------------------------------------- *
 * Modules
 * ---------------------------------------------------------------------- */

/**
 * The module a request belongs to, by its API path: `/api/v2/schools/…` is
 * Schools, `/api/gold/…` is Gold. The first segment after `/api` (and `/v2`)
 * names the area; a few areas answer to more than one segment.
 */
const MODULE_BY_SEGMENT: Record<string, string> = {
  "document-templates": "settings",
  employees: "people",
  equipment: "maintenance",
  hr: "people",
  inventory: "stores",
  preferences: "settings",
  sites: "settings",
};

/** Every module the log files changes under, keyed as stored. */
export const ACTIVITY_MODULES: Record<string, string> = {
  accounting: "Accounting",
  approvals: "Approvals",
  compensation: "Compensation",
  compliance: "Compliance",
  crm: "CRM",
  disbursements: "Disbursements",
  gold: "Gold",
  maintenance: "Maintenance",
  payroll: "Payroll",
  people: "People",
  retail: "Retail",
  schools: "Schools",
  settings: "Settings",
  settlements: "Settlements",
  stores: "Stores",
  users: "Users",
};

/** `/api/v2/schools/students/…` → `schools`. */
export function activityModuleForPath(path: string): string {
  const segments = path.split("/").filter(Boolean);
  let index = segments[0] === "api" ? 1 : 0;
  if (segments[index] === "v2") index += 1;
  const segment = segments[index] ?? "other";
  return MODULE_BY_SEGMENT[segment] ?? segment;
}

export function activityModuleLabel(module: string): string {
  if (ACTIVITY_MODULES[module]) return ACTIVITY_MODULES[module];
  const words = module.split(/[-_]/).filter(Boolean).join(" ");
  return words ? words[0]!.toUpperCase() + words.slice(1) : "Other";
}
