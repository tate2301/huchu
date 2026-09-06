/**
 * Shared query-building for the CRM record types.
 *
 * Every list endpoint runs through buildRecordWhere so the tenant scope and
 * the archived/merged exclusions can never be forgotten on one route and
 * remembered on another.
 */
import type { CrmAccountStatus, CrmCompanyType, CrmContactType, Prisma } from "@corelithzw/db";
import { z } from "zod";

import { customFieldWhere } from "@/lib/crm/custom-fields";

export const recordSortSchema = z.object({
  field: z.string().trim().max(60),
  direction: z.enum(["asc", "desc"]),
});

export type RecordSort = z.infer<typeof recordSortSchema>;

/** Sortable columns per record type. Anything not listed falls back to updatedAt. */
const SORTABLE: Record<string, string[]> = {
  PERSON: ["fullName", "personNo", "createdAt", "updatedAt", "lastContactedAt"],
  COMPANY: ["name", "clientNo", "createdAt", "updatedAt", "lastContactedAt"],
  DEAL: ["title", "dealNo", "value", "expectedCloseDate", "createdAt", "updatedAt", "stageEnteredAt"],
  SITE: ["name", "siteNo", "createdAt", "updatedAt"],
};

export function buildRecordOrderBy(entity: string, sort: RecordSort | undefined) {
  const allowed = SORTABLE[entity] ?? [];
  if (sort && allowed.includes(sort.field)) {
    return { [sort.field]: sort.direction };
  }
  return { updatedAt: "desc" as const };
}

export const personFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** Narrow to the members of a static list. */
  listId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  assignedToIds: z.array(z.string().uuid()).max(50).optional(),
  contactTypes: z.array(z.string().trim().max(40)).max(10).optional(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
  mineOnly: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const companyFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** Narrow to the members of a static list. */
  listId: z.string().uuid().optional(),
  companyTypes: z.array(z.string().trim().max(40)).max(10).optional(),
  accountStatuses: z.array(z.string().trim().max(40)).max(10).optional(),
  assignedToIds: z.array(z.string().uuid()).max(50).optional(),
  tags: z.array(z.string().trim().max(60)).max(20).optional(),
  parentClientId: z.string().uuid().optional(),
  mineOnly: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const dealFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** Narrow to the members of a static list. */
  listId: z.string().uuid().optional(),
  pipelineIds: z.array(z.string().uuid()).max(20).optional(),
  stageIds: z.array(z.string().uuid()).max(50).optional(),
  statuses: z.array(z.enum(["OPEN", "WON", "LOST"])).max(3).optional(),
  assignedToIds: z.array(z.string().uuid()).max(50).optional(),
  clientIds: z.array(z.string().uuid()).max(50).optional(),
  siteIds: z.array(z.string().uuid()).max(50).optional(),
  forecastCategories: z
    .array(z.enum(["PIPELINE", "BEST_CASE", "COMMIT", "CLOSED"]))
    .max(4)
    .optional(),
  valueMin: z.number().finite().nonnegative().optional(),
  valueMax: z.number().finite().nonnegative().optional(),
  closeFrom: z.string().datetime().optional(),
  closeTo: z.string().datetime().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  mineOnly: z.boolean().optional(),
  unassigned: z.boolean().optional(),
  overdueOnly: z.boolean().optional(),
  /** Deals sitting past their stage's inactivity limit. */
  staleOnly: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export const siteFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  /** Narrow to the members of a static list. */
  listId: z.string().uuid().optional(),
  clientIds: z.array(z.string().uuid()).max(50).optional(),
  cities: z.array(z.string().trim().max(80)).max(30).optional(),
  includeArchived: z.boolean().optional(),
  customFields: z.record(z.string(), z.unknown()).optional(),
});

export type PersonFilters = z.infer<typeof personFiltersSchema>;
export type CompanyFilters = z.infer<typeof companyFiltersSchema>;
export type DealFilters = z.infer<typeof dealFiltersSchema>;
export type SiteFilters = z.infer<typeof siteFiltersSchema>;

/** Fold a customFields filter map into AND clauses on the JSON column. */
function customFieldClauses(customFields: Record<string, unknown> | undefined) {
  if (!customFields) return [];
  return Object.entries(customFields)
    .map(([key, value]) => {
      const filter = customFieldWhere(key, value);
      return filter ? { customFields: filter } : null;
    })
    .filter(Boolean) as Array<{ customFields: Prisma.JsonFilter }>;
}

function ownerClauses(
  filters: { assignedToIds?: string[]; unassigned?: boolean; mineOnly?: boolean },
  userId: string,
) {
  const and: Array<Record<string, unknown>> = [];
  const alternatives: Array<Record<string, unknown>> = [];
  if (filters.assignedToIds?.length) alternatives.push({ assignedToId: { in: filters.assignedToIds } });
  if (filters.unassigned) alternatives.push({ assignedToId: null });
  if (alternatives.length === 1) and.push(alternatives[0]);
  else if (alternatives.length > 1) and.push({ OR: alternatives });
  if (filters.mineOnly) and.push({ assignedToId: userId });
  return and;
}

export function buildPersonWhere(
  companyId: string,
  filters: PersonFilters,
  userId: string,
): Prisma.CrmPersonWhereInput {
  const and: Prisma.CrmPersonWhereInput[] = [
    ...(ownerClauses(filters, userId) as Prisma.CrmPersonWhereInput[]),
    ...(customFieldClauses(filters.customFields) as Prisma.CrmPersonWhereInput[]),
  ];

  if (filters.clientId) and.push({ clientId: filters.clientId });
  if (filters.contactTypes?.length) {
    and.push({ contactType: { in: filters.contactTypes as CrmContactType[] } });
  }
  if (filters.tags?.length) and.push({ tags: { hasSome: filters.tags } });
  if (filters.q) {
    and.push({
      OR: [
        { fullName: { contains: filters.q, mode: "insensitive" } },
        { email: { contains: filters.q, mode: "insensitive" } },
        { phone: { contains: filters.q, mode: "insensitive" } },
        { personNo: { contains: filters.q, mode: "insensitive" } },
        { client: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }

  return {
    companyId,
    mergedIntoId: null,
    ...(filters.includeArchived ? {} : { archivedAt: null }),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export function buildCompanyWhere(
  companyId: string,
  filters: CompanyFilters,
  userId: string,
): Prisma.CrmClientWhereInput {
  const and: Prisma.CrmClientWhereInput[] = [
    ...(ownerClauses(filters, userId) as Prisma.CrmClientWhereInput[]),
    ...(customFieldClauses(filters.customFields) as Prisma.CrmClientWhereInput[]),
  ];

  if (filters.companyTypes?.length) {
    and.push({ companyType: { in: filters.companyTypes as CrmCompanyType[] } });
  }
  if (filters.accountStatuses?.length) {
    and.push({ accountStatus: { in: filters.accountStatuses as CrmAccountStatus[] } });
  }
  if (filters.parentClientId) and.push({ parentClientId: filters.parentClientId });
  if (filters.tags?.length) and.push({ tags: { hasSome: filters.tags } });
  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { tradingName: { contains: filters.q, mode: "insensitive" } },
        { clientNo: { contains: filters.q, mode: "insensitive" } },
        { email: { contains: filters.q, mode: "insensitive" } },
        { phone: { contains: filters.q, mode: "insensitive" } },
        { city: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  return {
    companyId,
    mergedIntoId: null,
    ...(filters.includeArchived ? {} : { archivedAt: null }),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export function buildDealWhere(
  companyId: string,
  filters: DealFilters,
  userId: string,
): Prisma.CrmDealWhereInput {
  const and: Prisma.CrmDealWhereInput[] = [
    ...(ownerClauses(filters, userId) as Prisma.CrmDealWhereInput[]),
    ...(customFieldClauses(filters.customFields) as Prisma.CrmDealWhereInput[]),
  ];

  if (filters.pipelineIds?.length) and.push({ pipelineId: { in: filters.pipelineIds } });
  if (filters.stageIds?.length) and.push({ stageId: { in: filters.stageIds } });
  if (filters.statuses?.length) and.push({ status: { in: filters.statuses } });
  if (filters.clientIds?.length) and.push({ clientId: { in: filters.clientIds } });
  if (filters.siteIds?.length) and.push({ siteId: { in: filters.siteIds } });
  if (filters.forecastCategories?.length) {
    and.push({ forecastCategory: { in: filters.forecastCategories } });
  }
  if (filters.valueMin !== undefined || filters.valueMax !== undefined) {
    and.push({
      value: {
        ...(filters.valueMin !== undefined ? { gte: filters.valueMin } : {}),
        ...(filters.valueMax !== undefined ? { lte: filters.valueMax } : {}),
      },
    });
  }
  if (filters.closeFrom || filters.closeTo) {
    and.push({
      expectedCloseDate: {
        ...(filters.closeFrom ? { gte: new Date(filters.closeFrom) } : {}),
        ...(filters.closeTo ? { lte: new Date(filters.closeTo) } : {}),
      },
    });
  }
  if (filters.createdFrom || filters.createdTo) {
    and.push({
      createdAt: {
        ...(filters.createdFrom ? { gte: new Date(filters.createdFrom) } : {}),
        ...(filters.createdTo ? { lte: new Date(filters.createdTo) } : {}),
      },
    });
  }
  if (filters.overdueOnly) {
    and.push({ followUps: { some: { status: "PENDING", dueAt: { lt: new Date() } } } });
  }
  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { dealNo: { contains: filters.q, mode: "insensitive" } },
        { client: { name: { contains: filters.q, mode: "insensitive" } } },
        { primaryContact: { fullName: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }

  return {
    companyId,
    ...(filters.includeArchived ? {} : { archivedAt: null }),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

export function buildSiteWhere(
  companyId: string,
  filters: SiteFilters,
): Prisma.CrmSiteWhereInput {
  const and: Prisma.CrmSiteWhereInput[] = [
    ...(customFieldClauses(filters.customFields) as Prisma.CrmSiteWhereInput[]),
  ];

  if (filters.clientIds?.length) and.push({ clientId: { in: filters.clientIds } });
  if (filters.cities?.length) and.push({ city: { in: filters.cities } });
  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { siteNo: { contains: filters.q, mode: "insensitive" } },
        { addressLine: { contains: filters.q, mode: "insensitive" } },
        { city: { contains: filters.q, mode: "insensitive" } },
        { client: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }

  return {
    companyId,
    ...(filters.includeArchived ? {} : { archivedAt: null }),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}

/** Parse a comma-separated list param, dropping blanks. */
export function listParam(searchParams: URLSearchParams, key: string): string[] | undefined {
  const raw = searchParams.get(key);
  if (!raw) return undefined;
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 ? parts : undefined;
}

export function boolParam(searchParams: URLSearchParams, key: string): boolean | undefined {
  const raw = searchParams.get(key);
  if (raw === null) return undefined;
  return raw === "1" || raw.toLowerCase() === "true";
}

export function numberParam(searchParams: URLSearchParams, key: string): number | undefined {
  const raw = searchParams.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Custom-field filters arrive as `cf.<key>=<value>`. */
export function customFieldParams(searchParams: URLSearchParams): Record<string, unknown> | undefined {
  const entries: Record<string, unknown> = {};
  for (const [key, value] of searchParams.entries()) {
    if (!key.startsWith("cf.")) continue;
    const fieldKey = key.slice(3);
    if (!fieldKey || value === "") continue;
    entries[fieldKey] = value.includes(",") ? value.split(",").map((part) => part.trim()) : value;
  }
  return Object.keys(entries).length > 0 ? entries : undefined;
}
