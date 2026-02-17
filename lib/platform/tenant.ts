type NullableString = string | null | undefined;
type HeaderRecordValue = string | string[] | undefined | null;
type RequestHeadersLike = Headers | Record<string, HeaderRecordValue>;

const TENANT_SLUG_PATTERN = /^[a-z0-9-]+$/;
const ACTIVE_TENANT_STATUS = "ACTIVE";

export type TenantContext = {
  companyId: string;
  companyName: string | null;
  companySlug: string;
  tenantStatus: string | null;
};

export type TenantClaims = {
  companySlug?: string;
  tenantStatus?: string;
};

export type PlatformHostContext = {
  host: string | null;
  hostname: string | null;
  tenantSlug: string | null;
  isCentralHost: boolean;
  isTenantHost: boolean;
  hasHostConfig: boolean;
  strictTenantEnforcement: boolean;
};

const tableExistsCache = new Map<string, boolean>();
const columnExistsCache = new Map<string, boolean>();

function normalizeHostValue(value: NullableString): string {
  if (!value) {
    return "";
  }

  const trimmed = value.trim().toLowerCase();

  if (!trimmed) {
    return "";
  }

  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");
}

function normalizeHostHeaderValue(value: NullableString): string {
  if (!value) {
    return "";
  }

  const firstValue = value.split(",")[0]?.trim() ?? "";
  return normalizeHostValue(firstValue);
}

function stripPort(host: string): string {
  const index = host.indexOf(":");
  return index === -1 ? host : host.slice(0, index);
}

function parseRootHosts(value: NullableString): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => normalizeHostValue(item))
    .filter(Boolean);
}

function getTenantSlugForHost(hostname: string | null, rootDomain: string | null): string | null {
  if (!hostname || !rootDomain) {
    return null;
  }

  if (hostname === rootDomain) {
    return null;
  }

  const suffix = `.${rootDomain}`;
  if (!hostname.endsWith(suffix)) {
    return null;
  }

  const tenantPrefix = hostname.slice(0, -suffix.length);
  const tenantSlug = tenantPrefix.split(".")[0]?.trim().toLowerCase() ?? "";

  if (!tenantSlug || !TENANT_SLUG_PATTERN.test(tenantSlug)) {
    return null;
  }

  return tenantSlug;
}

export function getPlatformHostContext(hostHeader: NullableString): PlatformHostContext {
  const host = normalizeHostHeaderValue(hostHeader);
  const hostname = host ? stripPort(host) : null;

  const rootDomain = normalizeHostValue(process.env.PLATFORM_ROOT_DOMAIN);
  const rootHosts = parseRootHosts(process.env.PLATFORM_ROOT_HOSTS);
  const hasHostConfig = Boolean(rootDomain || rootHosts.length > 0);
  const strictTenantEnforcement = Boolean(rootDomain);

  const centralHosts = new Set<string>();

  if (rootDomain) {
    centralHosts.add(rootDomain);
  }

  for (const rootHost of rootHosts) {
    centralHosts.add(rootHost);
    centralHosts.add(stripPort(rootHost));
  }

  const isCentralHost = Boolean(
    host &&
    (centralHosts.has(host) ||
      (hostname !== null && centralHosts.has(hostname)))
  );

  const tenantSlug = getTenantSlugForHost(hostname, rootDomain || null);

  return {
    host: host || null,
    hostname,
    tenantSlug,
    isCentralHost,
    isTenantHost: Boolean(tenantSlug),
    hasHostConfig,
    strictTenantEnforcement,
  };
}

function readHeaderValue(headers: RequestHeadersLike | null | undefined, key: string): string | null {
  if (!headers) {
    return null;
  }

  if (headers instanceof Headers) {
    const value = headers.get(key);
    return value?.trim() || null;
  }

  const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
  if (Array.isArray(direct)) {
    return direct[0]?.trim() || null;
  }
  if (typeof direct === "string") {
    return direct.trim() || null;
  }

  const matchedKey = Object.keys(headers).find((headerKey) => headerKey.toLowerCase() === key.toLowerCase());
  if (!matchedKey) {
    return null;
  }
  const value = headers[matchedKey];
  if (Array.isArray(value)) {
    return value[0]?.trim() || null;
  }
  if (typeof value === "string") {
    return value.trim() || null;
  }
  return null;
}

export function getHostHeaderFromRequestHeaders(headers: RequestHeadersLike | null | undefined): string | null {
  const forwardedHost = readHeaderValue(headers, "x-forwarded-host");
  const host = readHeaderValue(headers, "host");
  const resolvedHost = forwardedHost || host;

  const normalizedHost = normalizeHostHeaderValue(resolvedHost);
  return normalizedHost || null;
}

type ExistsRow = {
  exists: boolean;
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

type TenantRow = {
  id: string;
  name: string | null;
  slug: string;
  tenantStatus: string | null;
};

type TenantDomainRow = {
  id: string;
  name: string | null;
  slug: string;
  tenantStatus: string | null;
};

export async function resolveTenantBySlug(slug: string): Promise<TenantContext | null> {
  const tenantSlug = slug.trim().toLowerCase();

  if (!tenantSlug || !TENANT_SLUG_PATTERN.test(tenantSlug)) {
    return null;
  }

  const companyTableExists = await tableExists("Company");
  if (!companyTableExists) {
    return null;
  }

  const hasSlugColumn = await tableColumnExists("Company", "slug");
  if (!hasSlugColumn) {
    return null;
  }

  const hasTenantStatusColumn = await tableColumnExists("Company", "tenantStatus");
  const prisma = await getPrismaClient();

  try {
    const rows = hasTenantStatusColumn
      ? await prisma.$queryRawUnsafe<TenantRow[]>(
          `
            SELECT id, name, slug, "tenantStatus"
            FROM "Company"
            WHERE lower(slug) = lower($1)
            LIMIT 1
          `,
          tenantSlug
        )
      : await prisma.$queryRawUnsafe<TenantRow[]>(
          `
            SELECT id, name, slug, NULL::text AS "tenantStatus"
            FROM "Company"
            WHERE lower(slug) = lower($1)
            LIMIT 1
          `,
          tenantSlug
        );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      companyId: row.id,
      companyName: row.name,
      companySlug: row.slug.toLowerCase(),
      tenantStatus: row.tenantStatus ?? null,
    };
  } catch {
    return null;
  }
}

async function resolveTenantByCustomDomain(hostname: string): Promise<TenantContext | null> {
  const normalizedHostname = normalizeHostValue(hostname);
  if (!normalizedHostname) {
    return null;
  }

  const companyDomainTableExists = await tableExists("CompanyDomain");
  if (!companyDomainTableExists) {
    return null;
  }

  const hasHostnameColumn = await tableColumnExists("CompanyDomain", "hostname");
  if (!hasHostnameColumn) {
    return null;
  }

  const prisma = await getPrismaClient();
  const hasTenantStatusColumn = await tableColumnExists("Company", "tenantStatus");

  try {
    const rows = hasTenantStatusColumn
      ? await prisma.$queryRawUnsafe<TenantDomainRow[]>(
          `
            SELECT c.id, c.name, c.slug, c."tenantStatus"
            FROM "CompanyDomain" cd
            INNER JOIN "Company" c ON c.id = cd."companyId"
            WHERE lower(cd.hostname) = lower($1)
              AND cd.status IN ('VERIFIED', 'ACTIVE')
            ORDER BY CASE cd.status
              WHEN 'ACTIVE' THEN 0
              WHEN 'VERIFIED' THEN 1
              ELSE 2
            END ASC, cd."updatedAt" DESC
            LIMIT 1
          `,
          normalizedHostname,
        )
      : await prisma.$queryRawUnsafe<TenantDomainRow[]>(
          `
            SELECT c.id, c.name, c.slug, NULL::text AS "tenantStatus"
            FROM "CompanyDomain" cd
            INNER JOIN "Company" c ON c.id = cd."companyId"
            WHERE lower(cd.hostname) = lower($1)
              AND cd.status IN ('VERIFIED', 'ACTIVE')
            ORDER BY CASE cd.status
              WHEN 'ACTIVE' THEN 0
              WHEN 'VERIFIED' THEN 1
              ELSE 2
            END ASC, cd."updatedAt" DESC
            LIMIT 1
          `,
          normalizedHostname,
        );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      companyId: row.id,
      companyName: row.name,
      companySlug: row.slug.toLowerCase(),
      tenantStatus: row.tenantStatus ?? null,
    };
  } catch {
    return null;
  }
}

export async function resolveTenantFromHost(hostHeader: NullableString): Promise<TenantContext | null> {
  const hostContext = getPlatformHostContext(hostHeader);

  if (hostContext.tenantSlug) {
    return resolveTenantBySlug(hostContext.tenantSlug);
  }

  if (!hostContext.hostname) {
    return null;
  }

  return resolveTenantByCustomDomain(hostContext.hostname);
}

type CompanyClaimsRow = {
  slug: string | null;
  tenantStatus: string | null;
};

export async function getTenantClaimsForCompany(companyId: string): Promise<TenantClaims> {
  const normalizedCompanyId = companyId.trim();

  if (!normalizedCompanyId) {
    return {};
  }

  const companyTableExists = await tableExists("Company");
  if (!companyTableExists) {
    return {};
  }

  const hasSlugColumn = await tableColumnExists("Company", "slug");
  if (!hasSlugColumn) {
    return {};
  }

  const hasTenantStatusColumn = await tableColumnExists("Company", "tenantStatus");
  const prisma = await getPrismaClient();

  try {
    const rows = hasTenantStatusColumn
      ? await prisma.$queryRawUnsafe<CompanyClaimsRow[]>(
          `
            SELECT slug, "tenantStatus"
            FROM "Company"
            WHERE id = $1
            LIMIT 1
          `,
          normalizedCompanyId
        )
      : await prisma.$queryRawUnsafe<CompanyClaimsRow[]>(
          `
            SELECT slug, NULL::text AS "tenantStatus"
            FROM "Company"
            WHERE id = $1
            LIMIT 1
          `,
          normalizedCompanyId
        );

    const row = rows[0];
    if (!row) {
      return {};
    }

    return {
      companySlug: row.slug?.toLowerCase() ?? undefined,
      tenantStatus: row.tenantStatus ?? undefined,
    };
  } catch {
    return {};
  }
}

type CompanyDomainClaimRow = {
  hostname: string | null;
};

function getRootDomain(): string | null {
  const rootDomain = normalizeHostValue(process.env.PLATFORM_ROOT_DOMAIN);
  return rootDomain || null;
}

export function getCanonicalHost(hostHeader: NullableString): string | null {
  const host = normalizeHostHeaderValue(hostHeader);
  if (!host) {
    return null;
  }
  return stripPort(host);
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const normalized = normalizeHostValue(value);
    if (!normalized) continue;
    out.add(normalized);
  }
  return Array.from(out.values());
}

export async function getAllowedHostsForCompany(companyId: string): Promise<string[]> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    return [];
  }

  const claims = await getTenantClaimsForCompany(normalizedCompanyId);
  const rootDomain = getRootDomain();
  const subdomainHost =
    rootDomain && claims.companySlug
      ? `${claims.companySlug.trim().toLowerCase()}.${rootDomain}`
      : null;

  const companyDomainTableExists = await tableExists("CompanyDomain");
  if (!companyDomainTableExists) {
    return uniqueNonEmpty([subdomainHost]);
  }

  const hasHostnameColumn = await tableColumnExists("CompanyDomain", "hostname");
  const hasStatusColumn = await tableColumnExists("CompanyDomain", "status");
  if (!hasHostnameColumn || !hasStatusColumn) {
    return uniqueNonEmpty([subdomainHost]);
  }

  try {
    const prisma = await getPrismaClient();
    const domains = await prisma.$queryRawUnsafe<CompanyDomainClaimRow[]>(
      `
        SELECT hostname
        FROM "CompanyDomain"
        WHERE "companyId" = $1
          AND status IN ('VERIFIED', 'ACTIVE')
      `,
      normalizedCompanyId,
    );
    const domainHosts = domains.map((row) => row.hostname ?? null);
    return uniqueNonEmpty([subdomainHost, ...domainHosts]);
  } catch {
    return uniqueNonEmpty([subdomainHost]);
  }
}

export function isAllowedHost(hostHeader: NullableString, allowedHosts: string[] | undefined): boolean {
  const currentHost = getCanonicalHost(hostHeader);
  if (!currentHost) {
    return false;
  }

  const normalizedAllowedHosts = new Set(
    (allowedHosts ?? [])
      .map((host) => normalizeHostValue(host))
      .filter(Boolean),
  );

  if (normalizedAllowedHosts.size === 0) {
    return false;
  }

  return normalizedAllowedHosts.has(currentHost);
}

export function isTenantStatusActive(status: NullableString): boolean {
  if (!status) {
    return false;
  }

  return status.trim().toUpperCase() === ACTIVE_TENANT_STATUS;
}
