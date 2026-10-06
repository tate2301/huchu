import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { fieldRefusal, PeopleRefusal } from "./refusal";
import type { PersonRole } from "./roles";

/**
 * Where people work (80-admin 3.3): every site (`allSites`), or the sites in
 * `UserSiteAccess`. A person matches a site when they work at all of them or
 * at that one.
 */

type Client = Prisma.TransactionClient | typeof prisma;

export type SiteScope = { all: true } | { all: false; ids: string[] };

/** Where the caller works: what a site-limited manager may give. */
export async function siteScopeOf(companyId: string, userId: string, client: Client = prisma): Promise<SiteScope> {
  const user = await client.user.findFirst({
    where: { id: userId, companyId },
    select: { allSites: true, siteAccess: { select: { siteId: true } } },
  });
  if (!user || user.allSites) return { all: true };
  return { all: false, ids: user.siteAccess.map((row) => row.siteId) };
}

/**
 * The Sites tags checked (W-57): "ALL" or at least one open site of the
 * company; "ALL" for an owner; within a site-limited caller's own sites.
 * Throws 400 `fieldErrors.sites`.
 */
export async function checkSites(input: {
  companyId: string;
  sites: "ALL" | string[];
  role: PersonRole;
  caller: SiteScope;
  client?: Client;
}): Promise<SiteScope> {
  const client = input.client ?? prisma;
  if (input.sites === "ALL") {
    if (!input.caller.all) throw fieldRefusal({ sites: "You can only give sites you work at." });
    return { all: true };
  }
  const ids = [...new Set(input.sites)];
  if (input.role === "OWNER") throw fieldRefusal({ sites: "Owners see every site." });
  if (ids.length === 0) throw fieldRefusal({ sites: "Pick at least one site." });
  const open = await client.site.findMany({
    where: { companyId: input.companyId, isActive: true, id: { in: ids } },
    select: { id: true },
  });
  if (open.length !== ids.length) throw fieldRefusal({ sites: "Pick at least one site." });
  const caller = input.caller;
  if (!caller.all && ids.some((id) => !caller.ids.includes(id))) {
    throw fieldRefusal({ sites: "You can only give sites you work at." });
  }
  return { all: false, ids };
}

/**
 * `checkSites` for a form that reports every field at once: a sites refusal
 * goes into `fieldErrors` (null back) instead of being thrown.
 */
export async function checkSitesInto(
  fieldErrors: Record<string, string>,
  input: Parameters<typeof checkSites>[0],
): Promise<SiteScope | null> {
  try {
    return await checkSites(input);
  } catch (error) {
    const sites = error instanceof PeopleRefusal ? error.fieldErrors?.sites : undefined;
    if (!sites) throw error;
    fieldErrors.sites = sites;
    return null;
  }
}

/** Put a person's sites in place: `allSites`, and the access rows replaced. */
export async function writeSites(
  tx: Prisma.TransactionClient,
  input: { companyId: string; userId: string; scope: SiteScope },
): Promise<void> {
  await tx.userSiteAccess.deleteMany({ where: { userId: input.userId } });
  if (!input.scope.all) {
    await tx.userSiteAccess.createMany({
      data: input.scope.ids.map((siteId) => ({ userId: input.userId, siteId, companyId: input.companyId })),
    });
  }
}

/** Whether a person works at a site. */
export function worksAt(person: { allSites: boolean; siteIds: string[] }, siteId: string): boolean {
  return person.allSites || person.siteIds.includes(siteId);
}
