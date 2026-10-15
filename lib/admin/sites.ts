import { Prisma, type WorkspaceProfile } from "@prisma/client";

import { AdminRefusal } from "@/lib/admin/refusal";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { recordOperatorEvent } from "@/lib/operators/audit";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import { findDefaultPriceList } from "@/lib/retail/prices/change";
import { hasStockSentence } from "@/lib/retail/sites";
import { SITE_CODE_PATTERN, cleanSiteCode, placeCode } from "@/lib/retail/site-words";

/**
 * A workspace's sites, kept from the admin portal on the rules the workspace
 * keeps them by.
 *
 * A shop (the retail profile) keeps its own: a short code of 2 to 6 letters or
 * figures, a name no other open site has, a price list and a first place; and
 * a site with stock left, a shift open or the default's mark does not close. Every other workspace numbers its sites
 * SITE-0001 and on, and a site's code does not change once it is set; a mine
 * measures each site's output in tonnes, trips or wheelbarrows.
 *
 * Each change is a line on the workspace's own audit chain, under the
 * operator's name.
 */

export const SITE_UNITS = ["tonnes", "trips", "wheelbarrows"] as const;
export type SiteUnit = (typeof SITE_UNITS)[number];

/** A refusal that belongs to one field of the sheet. */
export class SiteFieldRefusal extends AdminRefusal {
  constructor(
    readonly field: "name" | "code" | "location" | "unit",
    message: string,
  ) {
    super(message);
  }
}

export type SiteWorkspace = { id: string; name: string; slug: string; workspaceProfile: WorkspaceProfile };

/** How a workspace keeps its sites, by its profile. */
export function siteRules(profile: WorkspaceProfile) {
  // Prisma hands the retail profile back as "RETAIL" though its types say the stored "THRIFT"; either is a shop.
  const retail = String(profile) === "RETAIL" || String(profile) === "THRIFT";
  return {
    retail,
    /** A mine's sites carry a measurement unit; nobody else's do. */
    units: profile === "GOLD_MINE" ? SITE_UNITS : null,
    nameMax: retail ? 120 : 200,
    locationMax: retail ? 240 : 200,
    /** Outside a shop, the code is on the site's records and stays as it was set. */
    codeFixed: !retail,
    codeHint: retail ? "2 to 6 letters or figures, like HRE." : "SITE-0001 and on. Left empty, it takes the next.",
  };
}

export type SiteInput = { name: string; code?: string | null; location?: string | null; unit?: string | null };

function cleanName(name: string, max: number) {
  const value = name.trim().replace(/\s+/g, " ");
  if (!value) throw new SiteFieldRefusal("name", "Name is needed.");
  if (value.length > max) throw new SiteFieldRefusal("name", `Keep the name to ${max} characters.`);
  return value;
}

function cleanLocation(location: string | null | undefined, max: number) {
  const value = (location ?? "").trim();
  if (value.length > max) throw new SiteFieldRefusal("location", `Keep the location to ${max} characters.`);
  return value || null;
}

function cleanUnit(unit: string | null | undefined, units: readonly string[] | null): SiteUnit | undefined {
  if (!units) return undefined;
  const value = (unit ?? "").trim().toLowerCase();
  if (!value) return "tonnes";
  if (!units.includes(value)) throw new SiteFieldRefusal("unit", "Choose tonnes, trips or wheelbarrows.");
  return value as SiteUnit;
}

function cleanShopCode(code: string | null | undefined) {
  const value = cleanSiteCode(code ?? "");
  if (!SITE_CODE_PATTERN.test(value)) throw new SiteFieldRefusal("code", "Write the short code as 2 to 6 letters or figures, like HRE.");
  return value;
}

type Tx = Prisma.TransactionClient;

async function checkShopName(tx: Tx, companyId: string, name: string, exceptId: string | null) {
  const clash = await tx.site.findFirst({
    where: { companyId, isActive: true, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (clash) throw new SiteFieldRefusal("name", `There is already an open site called ${clash.name}.`);
}

async function checkCode(tx: Tx, companyId: string, code: string, exceptId: string | null) {
  const clash = await tx.site.findFirst({
    where: { companyId, code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (clash) throw new SiteFieldRefusal("code", `${clash.name} already has the code ${code}.`);
}

function raced(error: unknown, code: string | undefined): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new SiteFieldRefusal("code", `Another site already has the code ${code ?? "chosen"}.`);
  }
  throw error;
}

/* ── Reading ──────────────────────────────────────────────────────────────── */

export type WorkspaceSiteRow = {
  id: string;
  name: string;
  code: string;
  location: string | null;
  unit: string | null;
  isActive: boolean;
  isDefault: boolean;
  tills: number;
  createdAt: Date;
};

/** Every site of one workspace, open and closed, by name. */
export async function workspaceSites(workspace: { id: string; workspaceProfile: WorkspaceProfile }): Promise<WorkspaceSiteRow[]> {
  const rules = siteRules(workspace.workspaceProfile);
  const [sites, profile] = await Promise.all([
    prisma.site.findMany({
      where: { companyId: workspace.id },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        measurementUnit: true,
        isActive: true,
        createdAt: true,
        _count: { select: { retailRegisters: { where: { isActive: true } } } },
      },
    }),
    rules.retail ? prisma.retailShopProfile.findUnique({ where: { companyId: workspace.id }, select: { defaultSiteId: true } }) : null,
  ]);
  return sites.map((site) => ({
    id: site.id,
    name: site.name,
    code: site.code,
    location: site.location,
    unit: rules.units ? site.measurementUnit : null,
    isActive: site.isActive,
    isDefault: site.id === profile?.defaultSiteId,
    tills: site._count.retailRegisters,
    createdAt: site.createdAt,
  }));
}

/** One site with its workspace, for the sheet and for every write. */
export async function findSite(id: string) {
  return prisma.site.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      code: true,
      location: true,
      measurementUnit: true,
      isActive: true,
      company: { select: { id: true, name: true, slug: true, workspaceProfile: true } },
    },
  });
}

export type SiteRecord = NonNullable<Awaited<ReturnType<typeof findSite>>>;

/** The sites a bulk action names, as the writes take them. */
export async function sitesByIds(ids: string[]) {
  return prisma.site.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      name: true,
      code: true,
      location: true,
      measurementUnit: true,
      isActive: true,
      company: { select: { id: true, name: true, slug: true, workspaceProfile: true } },
    },
  });
}

/* ── Add a site ───────────────────────────────────────────────────────────── */

export async function createWorkspaceSite(operator: SignedInOperator, workspace: SiteWorkspace, input: SiteInput) {
  const rules = siteRules(workspace.workspaceProfile);
  const name = cleanName(input.name, rules.nameMax);
  const location = cleanLocation(input.location, rules.locationMax);
  const unit = cleanUnit(input.unit, rules.units);
  let code: string | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      if (rules.retail) {
        code = cleanShopCode(input.code);
        await checkShopName(tx, workspace.id, name, null);
      } else {
        const typed = (input.code ?? "").trim();
        try {
          code = typed ? normalizeProvidedId(typed, "SITE") : await reserveIdentifier(tx, { companyId: workspace.id, entity: "SITE" });
        } catch {
          throw new SiteFieldRefusal("code", "Write the code as SITE-0001, or leave it empty for the next one.");
        }
      }
      await checkCode(tx, workspace.id, code, null);

      // A shop's site sells from a price list and keeps its stock in at least one place.
      let priceListId: string | null = null;
      if (rules.retail) {
        const list =
          (await findDefaultPriceList(tx, workspace.id)) ??
          (await tx.priceList.findFirst({ where: { companyId: workspace.id, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true } }));
        if (!list) throw new AdminRefusal(`${workspace.name} has no price list yet, so a site there would have nothing to sell from.`);
        priceListId = list.id;
      }

      const site = await tx.site.create({
        data: {
          companyId: workspace.id,
          name,
          code,
          location,
          isActive: true,
          ...(unit ? { measurementUnit: unit } : {}),
          ...(priceListId ? { priceListId } : {}),
        },
        select: { id: true, name: true, code: true },
      });
      if (rules.retail) {
        await tx.stockLocation.create({ data: { siteId: site.id, code: placeCode("Shop floor", []), name: "Shop floor", sortOrder: 0 } });
      }
      await recordOperatorEvent(
        {
          operatorId: operator.id,
          companyId: workspace.id,
          eventType: "operator.site.created",
          entityType: "site",
          entityId: site.id,
          payload: { name, code, location, ...(unit ? { unit } : {}) },
        },
        tx,
      );
      return site;
    });
  } catch (error) {
    if (error instanceof AdminRefusal) throw error;
    return raced(error, code);
  }
}

/* ── Change a site ────────────────────────────────────────────────────────── */

export async function updateWorkspaceSite(operator: SignedInOperator, site: SiteRecord, input: SiteInput) {
  const workspace = site.company;
  const rules = siteRules(workspace.workspaceProfile);
  if (rules.retail && !site.isActive) throw new AdminRefusal(`${site.name} is closed. A closed site keeps its details as they were.`);
  const name = cleanName(input.name, rules.nameMax);
  const location = cleanLocation(input.location, rules.locationMax);
  const unit = cleanUnit(input.unit ?? site.measurementUnit, rules.units);
  const sent = input.code?.trim() ?? "";
  if (rules.codeFixed && sent && sent.toUpperCase() !== site.code.toUpperCase()) {
    throw new SiteFieldRefusal("code", "A site's code stays as it was set: it is on the site's records.");
  }
  const typedCode = rules.codeFixed || !sent ? site.code : cleanShopCode(sent);

  const changes: Record<string, { from: string | null; to: string | null }> = {};
  const note = (key: string, from: string | null, to: string | null) => {
    if ((from ?? null) !== (to ?? null)) changes[key] = { from: from ?? null, to: to ?? null };
  };
  note("name", site.name, name);
  note("code", site.code, typedCode);
  note("location", site.location, location);
  if (unit) note("unit", site.measurementUnit, unit);
  if (Object.keys(changes).length === 0) return { changed: false };

  try {
    await prisma.$transaction(async (tx) => {
      if (changes.name && rules.retail) await checkShopName(tx, workspace.id, name, site.id);
      if (changes.code) await checkCode(tx, workspace.id, typedCode, site.id);
      await tx.site.update({
        where: { id: site.id },
        data: { name, code: typedCode, location, ...(unit ? { measurementUnit: unit } : {}) },
      });
      await recordOperatorEvent(
        {
          operatorId: operator.id,
          companyId: workspace.id,
          eventType: "operator.site.changed",
          entityType: "site",
          entityId: site.id,
          payload: { name, changes },
        },
        tx,
      );
    });
  } catch (error) {
    if (error instanceof AdminRefusal) throw error;
    return raced(error, typedCode);
  }
  return { changed: true };
}

/* ── Close and reopen ─────────────────────────────────────────────────────── */

/**
 * Closed: the site leaves the workspace's lists and its history stays. Where
 * the workspace would refuse — the default site, a shift still open, a shop's
 * stock left there — this refuses in the same words. A shop's tills there
 * stop and their devices are unpaired, as when the owner closes it.
 */
export async function closeWorkspaceSite(operator: SignedInOperator, site: SiteRecord, reason: string, now = new Date()) {
  const why = reason.trim();
  if (why.length < 3) throw new AdminRefusal("Say why, so the owner can see it in their audit log.");
  const workspace = site.company;
  const rules = siteRules(workspace.workspaceProfile);
  await prisma.$transaction(async (tx) => {
    const current = await tx.site.findUniqueOrThrow({ where: { id: site.id }, select: { isActive: true } });
    if (!current.isActive) throw new AdminRefusal(`${site.name} is already closed.`);
    const profile = await tx.retailShopProfile.findUnique({ where: { companyId: workspace.id }, select: { defaultSiteId: true } });
    if (profile?.defaultSiteId === site.id) throw new AdminRefusal("It is the default site. Make another site the default first.");
    const openShifts = await tx.retailShift.count({ where: { companyId: workspace.id, siteId: site.id, status: "OPEN" } });
    if (openShifts > 0) throw new AdminRefusal("Close the open shifts here first.");
    if (rules.retail) {
      const stocked = await tx.inventoryItem.count({ where: { siteId: site.id, currentStock: { not: 0 } } });
      if (stocked > 0) throw new AdminRefusal(hasStockSentence(stocked));
    }

    // Nothing sells at a closed site: its tills stop and their devices are unpaired.
    const tills = await tx.retailRegister.findMany({ where: { companyId: workspace.id, siteId: site.id, isActive: true }, select: { id: true } });
    const tillIds = tills.map((till) => till.id);
    let devicesUnpaired = 0;
    if (tillIds.length > 0) {
      devicesUnpaired = (
        await tx.retailDevice.updateMany({
          where: { companyId: workspace.id, registerId: { in: tillIds }, unpairedAt: null },
          data: { unpairedAt: now, unpairReason: "SITE_CLOSED" },
        })
      ).count;
      await tx.retailPairingCode.updateMany({
        where: { registerId: { in: tillIds }, usedAt: null, expiresAt: { gt: now } },
        data: { expiresAt: now },
      });
      await tx.retailRegister.updateMany({ where: { id: { in: tillIds } }, data: { isActive: false } });
    }
    await tx.site.update({ where: { id: site.id }, data: { isActive: false, closedAt: now, closedById: null } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.site.closed",
        entityType: "site",
        entityId: site.id,
        reason: why,
        payload: { name: site.name, code: site.code, tillsStopped: tillIds.length, devicesUnpaired },
      },
      tx,
    );
  });
}

/**
 * Open again, as it was. A shop's site comes back only while no open site has
 * its name; its tills stay stopped until they are paired again from inside the
 * workspace.
 */
export async function reopenWorkspaceSite(operator: SignedInOperator, site: SiteRecord, reason?: string) {
  const workspace = site.company;
  const rules = siteRules(workspace.workspaceProfile);
  await prisma.$transaction(async (tx) => {
    const current = await tx.site.findUniqueOrThrow({ where: { id: site.id }, select: { isActive: true } });
    if (current.isActive) throw new AdminRefusal(`${site.name} is open.`);
    if (rules.retail) {
      const clash = await tx.site.findFirst({
        where: { companyId: workspace.id, isActive: true, name: { equals: site.name, mode: "insensitive" }, id: { not: site.id } },
        select: { name: true },
      });
      if (clash) throw new AdminRefusal(`An open site is called ${clash.name} now. Rename one of them first.`);
    }
    await tx.site.update({ where: { id: site.id }, data: { isActive: true, closedAt: null, closedById: null } });
    await recordOperatorEvent(
      {
        operatorId: operator.id,
        companyId: workspace.id,
        eventType: "operator.site.reopened",
        entityType: "site",
        entityId: site.id,
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
        payload: { name: site.name, code: site.code },
      },
      tx,
    );
  });
}
