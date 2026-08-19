type UnknownRecord = Record<string, unknown>;

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "TRIALING"]);
const WARNING_STATUS = new Set(["ACTIVE", "TRIALING", "PAST_DUE"]);
const FORCE_BLOCK_STATUSES = new Set(["CANCELED", "CANCELLED", "DISABLED", "EXPIRED", "INACTIVE", "SUSPENDED", "UNPAID"]);

const tableExistsCache = new Map<string, boolean>();
const columnExistsCache = new Map<string, boolean>();

type ExistsRow = {
  exists: boolean;
};

type JsonRow = {
  data: UnknownRecord;
};

export type SubscriptionHealthState =
  | "MISSING_SUBSCRIPTION"
  | "ACTIVE"
  | "EXPIRING_SOON"
  | "IN_GRACE"
  | "EXPIRED_BLOCKED";

export interface SubscriptionHealth {
  state: SubscriptionHealthState;
  status: string | null;
  shouldBlock: boolean;
  warningDays: number;
  graceDays: number;
  currentPeriodEnd: string | null;
  daysUntilEnd: number | null;
  daysOverdue: number | null;
  reason: string;
}

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

async function tableExists(tableName: string): Promise<boolean> {
  const cacheKey = tableName.toLowerCase();
  const cached = tableExistsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const prisma = await getPrismaClient();
    const rows = await prisma.$queryRawUnsafe<ExistsRow[]>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND lower(table_name) = lower($1)
        ) AS "exists"
      `,
      tableName,
    );
    const exists = Boolean(rows[0]?.exists);
    tableExistsCache.set(cacheKey, exists);
    return exists;
  } catch {
    return false;
  }
}

async function tableColumnExists(tableName: string, columnName: string): Promise<boolean> {
  const cacheKey = `${tableName.toLowerCase()}:${columnName.toLowerCase()}`;
  const cached = columnExistsCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const prisma = await getPrismaClient();
    const rows = await prisma.$queryRawUnsafe<ExistsRow[]>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND lower(table_name) = lower($1)
            AND lower(column_name) = lower($2)
        ) AS "exists"
      `,
      tableName,
      columnName,
    );
    const exists = Boolean(rows[0]?.exists);
    columnExistsCache.set(cacheKey, exists);
    return exists;
  } catch {
    return false;
  }
}

function getBoolean(record: UnknownRecord, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return null;
}

function getString(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getDate(record: UnknownRecord, keys: string[]): Date | null {
  for (const key of keys) {
    const value = record[key];
    if (!value) continue;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  return null;
}

function normalizedStatus(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function roundDayDiff(milliseconds: number): number {
  return Math.floor(milliseconds / (24 * 60 * 60 * 1000));
}

async function getPlanMetadata(planId: string | null | undefined): Promise<{
  warningDays: number;
  graceDays: number;
}> {
  if (!planId) {
    return { warningDays: 14, graceDays: 7 };
  }

  const planTableExists = await tableExists("SubscriptionPlan");
  if (!planTableExists) {
    return { warningDays: 14, graceDays: 7 };
  }

  const hasWarningDays = await tableColumnExists("SubscriptionPlan", "warningDays");
  const hasGraceDays = await tableColumnExists("SubscriptionPlan", "graceDays");
  const warningSelect = hasWarningDays ? `"warningDays"` : `14::int AS "warningDays"`;
  const graceSelect = hasGraceDays ? `"graceDays"` : `7::int AS "graceDays"`;

  try {
    const prisma = await getPrismaClient();
    const rows = await prisma.$queryRawUnsafe<Array<{ warningDays: number | null; graceDays: number | null }>>(
      `
        SELECT ${warningSelect}, ${graceSelect}
        FROM "SubscriptionPlan"
        WHERE id = $1
        LIMIT 1
      `,
      planId,
    );
    return {
      warningDays: Math.max(0, Number(rows[0]?.warningDays ?? 14)),
      graceDays: Math.max(0, Number(rows[0]?.graceDays ?? 7)),
    };
  } catch {
    return { warningDays: 14, graceDays: 7 };
  }
}

export function isSubscriptionStatusActive(status: string | null | undefined): boolean {
  const normalized = normalizedStatus(status);
  if (!normalized) return false;
  return ACTIVE_SUBSCRIPTION_STATUSES.has(normalized);
}

export async function getLatestCompanySubscription(companyId: string): Promise<UnknownRecord | null> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) return null;

  const subscriptionTableExists = await tableExists("CompanySubscription");
  if (!subscriptionTableExists) return null;

  const hasCompanyIdColumn = await tableColumnExists("CompanySubscription", "companyId");
  if (!hasCompanyIdColumn) return null;

  const hasUpdatedAt = await tableColumnExists("CompanySubscription", "updatedAt");
  const hasCreatedAt = await tableColumnExists("CompanySubscription", "createdAt");
  const orderClause = hasUpdatedAt
    ? 'ORDER BY cs."updatedAt" DESC'
    : hasCreatedAt
      ? 'ORDER BY cs."createdAt" DESC'
      : "";

  try {
    const prisma = await getPrismaClient();
    const rows = await prisma.$queryRawUnsafe<JsonRow[]>(
      `
        SELECT to_jsonb(cs) AS data
        FROM "CompanySubscription" cs
        WHERE cs."companyId" = $1
        ${orderClause}
        LIMIT 1
      `,
      normalizedCompanyId,
    );
    return rows[0]?.data ?? null;
  } catch {
    return null;
  }
}

export async function getSubscriptionHealth(companyId: string): Promise<SubscriptionHealth> {
  const subscription = await getLatestCompanySubscription(companyId);
  if (!subscription) {
    return {
      state: "MISSING_SUBSCRIPTION",
      status: null,
      shouldBlock: true,
      warningDays: 14,
      graceDays: 7,
      currentPeriodEnd: null,
      daysUntilEnd: null,
      daysOverdue: null,
      reason: "No subscription record found.",
    };
  }

  const status = normalizedStatus(getString(subscription, ["status", "subscriptionStatus", "state"]));
  const explicitActive = getBoolean(subscription, ["isActive", "active", "enabled"]);
  const currentPeriodEnd = getDate(subscription, ["currentPeriodEnd", "trialEndsAt", "expiresAt", "endsAt", "endedAt", "endDate"]);
  const planId = getString(subscription, ["planId"]);
  const planMeta = await getPlanMetadata(planId);

  const now = Date.now();
  const untilEndDays = currentPeriodEnd ? roundDayDiff(currentPeriodEnd.getTime() - now) : null;
  const overdueDays = untilEndDays !== null && untilEndDays < 0 ? Math.abs(untilEndDays) : 0;

  if (explicitActive === false) {
    return {
      state: "EXPIRED_BLOCKED",
      status,
      shouldBlock: true,
      warningDays: planMeta.warningDays,
      graceDays: planMeta.graceDays,
      currentPeriodEnd: toIso(currentPeriodEnd),
      daysUntilEnd: untilEndDays,
      daysOverdue: overdueDays || null,
      reason: "Subscription explicitly marked inactive.",
    };
  }

  if (status && FORCE_BLOCK_STATUSES.has(status)) {
    return {
      state: "EXPIRED_BLOCKED",
      status,
      shouldBlock: true,
      warningDays: planMeta.warningDays,
      graceDays: planMeta.graceDays,
      currentPeriodEnd: toIso(currentPeriodEnd),
      daysUntilEnd: untilEndDays,
      daysOverdue: overdueDays || null,
      reason: `Subscription status is ${status}.`,
    };
  }

  if (currentPeriodEnd) {
    if (untilEndDays !== null && untilEndDays < 0) {
      if (overdueDays <= planMeta.graceDays) {
        return {
          state: "IN_GRACE",
          status,
          shouldBlock: false,
          warningDays: planMeta.warningDays,
          graceDays: planMeta.graceDays,
          currentPeriodEnd: toIso(currentPeriodEnd),
          daysUntilEnd: untilEndDays,
          daysOverdue: overdueDays,
          reason: `Subscription is in grace period (${overdueDays}/${planMeta.graceDays} days overdue).`,
        };
      }
      return {
        state: "EXPIRED_BLOCKED",
        status,
        shouldBlock: true,
        warningDays: planMeta.warningDays,
        graceDays: planMeta.graceDays,
        currentPeriodEnd: toIso(currentPeriodEnd),
        daysUntilEnd: untilEndDays,
        daysOverdue: overdueDays,
        reason: `Subscription grace period exceeded (${overdueDays} days overdue).`,
      };
    }

    if (untilEndDays !== null && untilEndDays <= planMeta.warningDays && WARNING_STATUS.has(status ?? "ACTIVE")) {
      return {
        state: "EXPIRING_SOON",
        status,
        shouldBlock: false,
        warningDays: planMeta.warningDays,
        graceDays: planMeta.graceDays,
        currentPeriodEnd: toIso(currentPeriodEnd),
        daysUntilEnd: untilEndDays,
        daysOverdue: null,
        reason: `Subscription expires in ${untilEndDays} day(s).`,
      };
    }
  }

  return {
    state: "ACTIVE",
    status,
    shouldBlock: false,
    warningDays: planMeta.warningDays,
    graceDays: planMeta.graceDays,
    currentPeriodEnd: toIso(currentPeriodEnd),
    daysUntilEnd: untilEndDays,
    daysOverdue: null,
    reason: "Subscription is active.",
  };
}

export async function hasActiveSubscription(companyId: string): Promise<boolean> {
  const health = await getSubscriptionHealth(companyId);
  return !health.shouldBlock;
}

/**
 * The tenant status a lapsed subscription produces.
 *
 * `enrichTokenClaims` stamps this on the JWT when `getSubscriptionHealth` comes
 * back with `shouldBlock`, and it is the ONLY non-ACTIVE status that means "the
 * bill is unpaid" rather than "an operator turned this tenant off". The proxy
 * has to tell those two apart: one is degraded, the other is closed.
 */
export const SUBSCRIPTION_INACTIVE_TENANT_STATUS = "SUBSCRIPTION_INACTIVE";

/** The error code a write refused for non-payment carries. */
export const SUBSCRIPTION_READ_ONLY_CODE = "SUBSCRIPTION_READ_ONLY";

/**
 * The health states `getSubscriptionHealth` returns with `shouldBlock: true`.
 *
 * Kept as a set because the enforcement point is the proxy, which runs before
 * any database is reachable and can only see the `subscriptionHealth` state
 * already on the token. `lib/platform/gating/enforcement.test.ts` pins this set
 * against `getSubscriptionHealth` itself so the two cannot drift in silence.
 *
 * `MISSING_SUBSCRIPTION` is in here on purpose: a workspace with no subscription
 * row is a workspace nobody is billing, and the state machine has always treated
 * it as blocked. Under SS-1.2 that costs it its writes, not its data.
 */
const BLOCKING_HEALTH_STATES: ReadonlySet<string> = new Set<SubscriptionHealthState>([
  "MISSING_SUBSCRIPTION",
  "EXPIRED_BLOCKED",
]);

/** Whether a `SubscriptionHealth.state` value is one that blocks. */
export function isBlockingSubscriptionState(state: string | null | undefined): boolean {
  const normalized = normalizedStatus(state);
  return normalized ? BLOCKING_HEALTH_STATES.has(normalized) : false;
}

/** Whether a tenant status says "unpaid" rather than "switched off". */
export function isSubscriptionOnlyTenantStatus(status: string | null | undefined): boolean {
  return normalizedStatus(status) === SUBSCRIPTION_INACTIVE_TENANT_STATUS;
}

/**
 * Whether this session's workspace is degraded to read-only.
 *
 * Both signals are consulted because they are written at different moments: the
 * state is the richer one, and the tenant status is what an older token that
 * predates the `subscriptionHealth` claim still carries. Either one saying
 * "blocked" is enough — a workspace does not become writable again because half
 * of the claim is stale.
 */
export function isSubscriptionReadOnly(claims: {
  subscriptionHealth?: string | null;
  tenantStatus?: string | null;
}): boolean {
  return (
    isBlockingSubscriptionState(claims.subscriptionHealth) ||
    isSubscriptionOnlyTenantStatus(claims.tenantStatus)
  );
}

/**
 * Methods that only read.
 *
 * The list is the safe-method list from the HTTP spec, minus nothing and plus
 * nothing: this is the line between "can still run their shop" and "cannot".
 */
const READ_ONLY_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

export function isReadOnlyHttpMethod(method: string | null | undefined): boolean {
  return READ_ONLY_METHODS.has((method ?? "GET").trim().toUpperCase());
}

