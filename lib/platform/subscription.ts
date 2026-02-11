type UnknownRecord = Record<string, unknown>;

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["ACTIVE", "TRIALING"]);

const INACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "CANCELED",
  "CANCELLED",
  "DISABLED",
  "EXPIRED",
  "INACTIVE",
  "PAST_DUE",
  "SUSPENDED",
  "UNPAID",
]);

const tableExistsCache = new Map<string, boolean>();
const columnExistsCache = new Map<string, boolean>();

type ExistsRow = {
  exists: boolean;
};

type JsonRow = {
  data: UnknownRecord;
};

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

async function tableExists(tableName: string): Promise<boolean> {
  const cacheKey = tableName.toLowerCase();
  const cached = tableExistsCache.get(cacheKey);

  if (cached !== undefined) {
    return cached;
  }

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
      tableName
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

  if (cached !== undefined) {
    return cached;
  }

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
      columnName
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

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

function getString(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getDate(record: UnknownRecord, keys: string[]): Date | null {
  for (const key of keys) {
    const value = record[key];

    if (!value) {
      continue;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  }

  return null;
}

export function isSubscriptionStatusActive(status: string | null | undefined): boolean {
  if (!status) {
    return false;
  }

  const normalizedStatus = status.trim().toUpperCase();

  if (ACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return true;
  }

  if (INACTIVE_SUBSCRIPTION_STATUSES.has(normalizedStatus)) {
    return false;
  }

  return false;
}

export async function getLatestCompanySubscription(companyId: string): Promise<UnknownRecord | null> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    return null;
  }

  const subscriptionTableExists = await tableExists("CompanySubscription");
  if (!subscriptionTableExists) {
    return null;
  }

  const hasCompanyIdColumn = await tableColumnExists("CompanySubscription", "companyId");
  if (!hasCompanyIdColumn) {
    return null;
  }

  const hasUpdatedAt = await tableColumnExists("CompanySubscription", "updatedAt");
  const hasCreatedAt = await tableColumnExists("CompanySubscription", "createdAt");
  const orderClause = hasUpdatedAt
    ? 'ORDER BY cs."updatedAt" DESC'
    : hasCreatedAt
      ? 'ORDER BY cs."createdAt" DESC'
      : "";

  const prisma = await getPrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe<JsonRow[]>(
      `
        SELECT to_jsonb(cs) AS data
        FROM "CompanySubscription" cs
        WHERE cs."companyId" = $1
        ${orderClause}
        LIMIT 1
      `,
      normalizedCompanyId
    );

    return rows[0]?.data ?? null;
  } catch {
    return null;
  }
}

export async function hasActiveSubscription(companyId: string): Promise<boolean> {
  const subscription = await getLatestCompanySubscription(companyId);
  if (!subscription) {
    return false;
  }

  const explicitActive = getBoolean(subscription, ["isActive", "active", "enabled"]);
  if (explicitActive === false) {
    return false;
  }

  const status = getString(subscription, ["status", "subscriptionStatus", "state"]);
  if (status && !isSubscriptionStatusActive(status)) {
    return false;
  }

  const endsAt = getDate(subscription, ["endsAt", "expiresAt", "currentPeriodEnd", "endDate"]);
  if (endsAt && endsAt.getTime() < Date.now()) {
    return false;
  }

  if (explicitActive === true) {
    return true;
  }

  if (status) {
    return true;
  }

  return true;
}
