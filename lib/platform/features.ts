type UnknownRecord = Record<string, unknown>;

export type FeatureMap = Record<string, boolean>;

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

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

function getFeatureKey(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      const normalized = normalizeFeatureKey(value);
      if (normalized) {
        return normalized;
      }
    }
  }

  return null;
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

async function loadFeatureDefaults(): Promise<FeatureMap> {
  const featuresTableExists = await tableExists("PlatformFeature");
  if (!featuresTableExists) {
    return {};
  }

  const prisma = await getPrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe<JsonRow[]>(
      `
        SELECT to_jsonb(pf) AS data
        FROM "PlatformFeature" pf
      `
    );

    const featureMap: FeatureMap = {};

    for (const row of rows) {
      const featureKey = getFeatureKey(row.data, ["key", "featureKey", "code", "slug", "id"]);
      if (!featureKey) {
        continue;
      }

      const enabled = getBoolean(row.data, ["enabledByDefault", "defaultEnabled", "enabled", "isEnabled", "active"]);
      featureMap[featureKey] = enabled ?? false;
    }

    return featureMap;
  } catch {
    return {};
  }
}

async function loadCompanyFeatureOverrides(companyId: string): Promise<FeatureMap> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    return {};
  }

  const companyFeatureTableExists = await tableExists("CompanyFeatureFlag");
  if (!companyFeatureTableExists) {
    return {};
  }

  const hasCompanyIdColumn = await tableColumnExists("CompanyFeatureFlag", "companyId");
  if (!hasCompanyIdColumn) {
    return {};
  }

  const prisma = await getPrismaClient();

  try {
    const rows = await prisma.$queryRawUnsafe<JsonRow[]>(
      `
        SELECT to_jsonb(cff) AS data
        FROM "CompanyFeatureFlag" cff
        WHERE cff."companyId" = $1
      `,
      normalizedCompanyId
    );

    const featureMap: FeatureMap = {};

    for (const row of rows) {
      const featureKey = getFeatureKey(row.data, ["featureKey", "key", "feature", "featureCode", "featureSlug", "featureId", "id"]);
      if (!featureKey) {
        continue;
      }

      const enabled = getBoolean(row.data, ["enabled", "isEnabled", "active"]);
      if (enabled !== null) {
        featureMap[featureKey] = enabled;
      }
    }

    return featureMap;
  } catch {
    return {};
  }
}

export async function getFeatureMap(companyId: string): Promise<FeatureMap> {
  const defaults = await loadFeatureDefaults();
  const overrides = await loadCompanyFeatureOverrides(companyId);

  return {
    ...defaults,
    ...overrides,
  };
}

export async function hasFeature(companyId: string, featureKey: string): Promise<boolean> {
  const normalizedFeatureKey = normalizeFeatureKey(featureKey);
  if (!normalizedFeatureKey) {
    return false;
  }

  const featureMap = await getFeatureMap(companyId);
  return featureMap[normalizedFeatureKey] === true;
}
