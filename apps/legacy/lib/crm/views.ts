/**
 * Lead view filters — the single serialisable shape shared by the leads table,
 * the pipeline board, bulk actions, and saved views.
 *
 * `buildLeadWhere` is the one place a lead query gets assembled, so the tenant
 * scope can never be forgotten and every surface filters identically.
 */
import type { Prisma } from "@corelithzw/db";
import { z } from "zod";

import { crmLeadStageSchema } from "@/lib/crm/pipeline";

export const crmLeadChannelSchema = z.enum([
  "MANUAL",
  "WEB_FORM",
  "WEBHOOK",
  "SOCIAL",
  "ADS",
  "REFERRAL",
  "OTHER",
]);

export const leadViewFiltersSchema = z.object({
  q: z.string().trim().max(200).optional(),
  stages: z.array(crmLeadStageSchema).max(8).optional(),
  assignedToIds: z.array(z.string().uuid()).max(50).optional(),
  /** Include leads with no owner. Combines with `assignedToIds` as an OR. */
  unassigned: z.boolean().optional(),
  /** Restrict to the calling user's own leads; resolved server-side. */
  mineOnly: z.boolean().optional(),
  channels: z.array(crmLeadChannelSchema).max(7).optional(),
  sources: z.array(z.string().trim().max(120)).max(50).optional(),
  valueMin: z.number().finite().nonnegative().optional(),
  valueMax: z.number().finite().nonnegative().optional(),
  createdFrom: z.string().datetime().optional(),
  createdTo: z.string().datetime().optional(),
  /** Only leads with a pending follow-up already past due. */
  overdueOnly: z.boolean().optional(),
  /**
   * Show archived leads instead of live ones. Archiving is not a filter people
   * combine with others — it is a different question ("what did we put away")
   * — so it swaps the set rather than narrowing it.
   */
  archived: z.boolean().optional(),
});

export type LeadViewFilters = z.infer<typeof leadViewFiltersSchema>;

export const leadSortSchema = z.object({
  field: z.enum(["createdAt", "updatedAt", "estimatedValue", "leadNo", "title", "stage"]),
  direction: z.enum(["asc", "desc"]),
});

export type LeadSort = z.infer<typeof leadSortSchema>;

export const DEFAULT_LEAD_SORT: LeadSort = { field: "updatedAt", direction: "desc" };

/**
 * Parse filters out of a URLSearchParams. Array params are comma-separated;
 * booleans accept "1"/"true". Unknown or malformed values are dropped rather
 * than rejected — a bad query string should narrow nothing, not 400 the page.
 */
export function parseLeadFiltersFromParams(searchParams: URLSearchParams): LeadViewFilters {
  const list = (key: string) => {
    const raw = searchParams.get(key);
    if (!raw) return undefined;
    const parts = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : undefined;
  };
  const bool = (key: string) => {
    const raw = searchParams.get(key);
    if (raw === null) return undefined;
    return raw === "1" || raw.toLowerCase() === "true";
  };
  const num = (key: string) => {
    const raw = searchParams.get(key);
    if (raw === null || raw.trim() === "") return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const candidate = {
    q: searchParams.get("q")?.trim() || undefined,
    stages: list("stages"),
    assignedToIds: list("assignedToIds"),
    unassigned: bool("unassigned"),
    mineOnly: bool("mineOnly"),
    channels: list("channels"),
    sources: list("sources"),
    valueMin: num("valueMin"),
    valueMax: num("valueMax"),
    createdFrom: searchParams.get("createdFrom") || undefined,
    createdTo: searchParams.get("createdTo") || undefined,
    overdueOnly: bool("overdueOnly"),
    archived: bool("archived"),
  };

  const parsed = leadViewFiltersSchema.safeParse(candidate);
  return parsed.success ? parsed.data : {};
}

/**
 * Build the Prisma where clause for a lead query. `companyId` is applied
 * unconditionally — every caller is tenant-scoped by construction.
 */
export function buildLeadWhere(
  companyId: string,
  filters: LeadViewFilters,
  userId: string,
): Prisma.CrmLeadWhereInput {
  const and: Prisma.CrmLeadWhereInput[] = [];

  // Archived leads are out of every list, board and count unless they are what
  // was asked for. This is also what stops a converted lead and the deal it
  // became appearing as two live opportunities: conversion archives the lead,
  // so the pipeline stops counting the same piece of business twice.
  and.push(filters.archived ? { archivedAt: { not: null } } : { archivedAt: null });

  if (filters.stages?.length) {
    and.push({ stage: { in: filters.stages } });
  }

  // Owner filter: explicit owners and "unassigned" are alternatives, so they
  // combine as an OR. mineOnly is a separate, narrowing condition.
  const ownerClauses: Prisma.CrmLeadWhereInput[] = [];
  if (filters.assignedToIds?.length) {
    ownerClauses.push({ assignedToId: { in: filters.assignedToIds } });
  }
  if (filters.unassigned) {
    ownerClauses.push({ assignedToId: null });
  }
  if (ownerClauses.length === 1) {
    and.push(ownerClauses[0]);
  } else if (ownerClauses.length > 1) {
    and.push({ OR: ownerClauses });
  }
  if (filters.mineOnly) {
    and.push({ assignedToId: userId });
  }

  if (filters.channels?.length) {
    and.push({ sourceChannel: { in: filters.channels } });
  }
  if (filters.sources?.length) {
    and.push({ source: { in: filters.sources } });
  }

  if (filters.valueMin !== undefined || filters.valueMax !== undefined) {
    and.push({
      estimatedValue: {
        ...(filters.valueMin !== undefined ? { gte: filters.valueMin } : {}),
        ...(filters.valueMax !== undefined ? { lte: filters.valueMax } : {}),
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
    and.push({
      followUps: { some: { status: "PENDING", dueAt: { lt: new Date() } } },
    });
  }

  if (filters.q) {
    and.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { leadNo: { contains: filters.q, mode: "insensitive" } },
        { contactName: { contains: filters.q, mode: "insensitive" } },
        { contactEmail: { contains: filters.q, mode: "insensitive" } },
        { client: { name: { contains: filters.q, mode: "insensitive" } } },
      ],
    });
  }

  return { companyId, ...(and.length > 0 ? { AND: and } : {}) };
}

export function buildLeadOrderBy(sort: LeadSort | undefined): Prisma.CrmLeadOrderByWithRelationInput {
  const resolved = sort ?? DEFAULT_LEAD_SORT;
  return { [resolved.field]: resolved.direction };
}

/** True when the filter set would narrow anything at all. */
export function hasActiveLeadFilters(filters: LeadViewFilters): boolean {
  return Object.entries(filters).some(([, value]) => {
    if (value === undefined || value === null) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim() !== "";
    if (typeof value === "boolean") return value;
    return true;
  });
}
