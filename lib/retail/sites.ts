import { Prisma } from "@prisma/client";
import { z } from "zod";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { activeRetailPriceList } from "@/lib/retail/shelf-pricing";
import {
  SITE_CODE_PATTERN,
  cleanSiteCode,
  noRoomSentence,
  placeCode,
  placesWords,
  siteSub,
  suggestSiteCode,
  zimbabwePhone,
  type PlanRoom,
  type SiteState,
} from "@/lib/retail/site-words";

/**
 * A shop's sites and the places inside them (10-setup W-03, W-66, 4.2).
 *
 * A site is one shop: a name, a short code for receipts and transfers, a
 * phone, an address, its opening hours and the price list its tills sell
 * from. Inside it are places (`StockLocation`) — the shop floor, a back store,
 * a cold room — in the owner's order. A site with one place never asks which.
 *
 * Removing a place moves what it holds to the first place that remains, one
 * `TRANSFER` movement per stock line (`PLACE_MOVE`), before the place goes.
 * On hand is held per site and line, not per place, so a line moves whole.
 *
 * Closing keeps the site's history: it leaves every list and filter, its tills
 * stop, and it shows under State: Closed. The default site cannot close, nor
 * can a site with stock left or a shift still open.
 *
 * The plan sets how many open sites a shop may have (`SubscriptionPlan.maxSites`).
 */

export type SiteRow = {
  id: string;
  name: string;
  code: string;
  /** "Shop floor, back store, cold room". */
  places: string;
  /** Tills that sell there. */
  tills: number;
  priceList: string | null;
  /** Null for someone who may not see cost. */
  stockValue: string | null;
  state: SiteState;
};

export type SitePlace = { id: string; name: string; hasStock: boolean };

export type SiteDetail = SiteRow & {
  phone: string | null;
  address: string | null;
  openingHours: string | null;
  priceListId: string | null;
  placeList: SitePlace[];
  isDefault: boolean;
  /** "Default site · 3 tills · US$41,280.00 in stock". */
  sub: string;
};

export type PriceListOption = { id: string; name: string; sub: string };

export type SiteNewContext = {
  priceLists: PriceListOption[];
  /** The open sites stock could come from, the default first. */
  otherSites: Array<{ id: string; name: string }>;
  /** Null when the shop's plan sets no limit. */
  plan: { name: string; maxSites: number | null; openSites: number } | null;
  suggestedCode: string;
  /** Every short code in use, so the sheet suggests one that is free as the name is typed. */
  takenCodes: string[];
  /** The list a new site sells from unless another is chosen. */
  defaultPriceListId: string | null;
};

/** A refusal with its status, its sentence, and the field or code it belongs to. */
export class SiteRefusal extends Error {
  constructor(
    readonly status: 400 | 404 | 409,
    message: string,
    readonly opts: { field?: string; code?: string } = {},
  ) {
    super(message);
    this.name = "SiteRefusal";
  }
}

const NOT_FOUND = "That site is not one of this shop's.";

/* ── Input ────────────────────────────────────────────────────────────────── */

/**
 * Left out stays left out (undefined), so a PATCH that does not send a field
 * leaves it as it is; sent empty or null clears it.
 */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => (value === undefined ? undefined : value ? value : null));

const placeInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "A place needs a name.").max(60, "Keep each place to 60 characters."),
});

const fields = {
  name: z.string().trim().min(1, "Name is needed.").max(120, "Keep the name to 120 characters."),
  code: z
    .string()
    .transform(cleanSiteCode)
    .refine((code) => SITE_CODE_PATTERN.test(code), "Write the short code as 2 to 6 letters or figures, like HRE."),
  phone: z
    .string()
    .nullish()
    .transform((value, issue) => {
      if (value === undefined) return undefined;
      const typed = (value ?? "").trim();
      if (!typed) return null;
      const phone = zimbabwePhone(typed);
      if (!phone) {
        issue.addIssue({ code: "custom", message: "Write a Zimbabwe number, like +263 24 270 5521." });
        return z.NEVER;
      }
      return phone;
    }),
  address: optionalText(240, "Keep the address to 240 characters."),
  places: z
    .array(placeInput)
    .min(1, "A site keeps at least one place.")
    .max(20, "A site has at most 20 places.")
    .superRefine((places, issue) => {
      const seen = new Set<string>();
      for (const place of places) {
        const key = place.name.toLowerCase();
        if (seen.has(key)) issue.addIssue({ code: "custom", message: `${place.name} is there twice.` });
        seen.add(key);
      }
    }),
  priceListId: z.string({ error: "Choose a price list." }).uuid("Choose a price list."),
  openingHours: optionalText(120, "Keep the hours to 120 characters."),
};

/** Add a site (`SiteInput`). */
export const siteInput = z.object({ ...fields, stock: z.enum(["EMPTY", "MOVE"]).optional() });
export type SiteInput = z.infer<typeof siteInput>;

/** Change a site: any of its fields, and `isDefault`. */
export const sitePatch = z.object({ ...fields, isDefault: z.boolean() }).partial();
export type SitePatch = z.infer<typeof sitePatch>;

/** The zod issues as `{ field: sentence }`, first issue per field. */
export function siteFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/* ── Reading ──────────────────────────────────────────────────────────────── */

type Client = Prisma.TransactionClient | typeof prisma;

const siteSelect = {
  id: true,
  name: true,
  code: true,
  location: true,
  phone: true,
  openingHours: true,
  priceListId: true,
  isActive: true,
  closedAt: true,
  priceList: { select: { name: true } },
  stockLocations: {
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true },
  },
  _count: { select: { retailRegisters: { where: { isActive: true } } } },
} satisfies Prisma.SiteSelect;

type SiteRecord = Prisma.SiteGetPayload<{ select: typeof siteSelect }>;

async function defaultSiteIdOf(client: Client, companyId: string): Promise<string | null> {
  const profile = await client.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } });
  return profile?.defaultSiteId ?? null;
}

/** What the stock at each site is worth at cost. */
async function stockValues(client: Client, siteIds: string[]): Promise<Map<string, number>> {
  if (siteIds.length === 0) return new Map();
  const rows = await client.$queryRaw<Array<{ siteId: string; value: Prisma.Decimal | null }>>`
    SELECT "siteId", SUM("currentStock" * COALESCE("unitCost", 0)) AS value
    FROM "InventoryItem"
    WHERE "siteId" IN (${Prisma.join(siteIds)})
    GROUP BY "siteId"`;
  return new Map(rows.map((row) => [row.siteId, Math.round(Number(row.value ?? 0) * 100) / 100]));
}

const stateOf = (site: { id: string; isActive: boolean }, defaultSiteId: string | null): SiteState =>
  !site.isActive ? "CLOSED" : site.id === defaultSiteId ? "DEFAULT" : "OPEN";

function rowOf(site: SiteRecord, defaultSiteId: string | null, value: number | null): SiteRow {
  return {
    id: site.id,
    name: site.name,
    code: site.code,
    places: placesWords(site.stockLocations.map((place) => place.name)),
    tills: site._count.retailRegisters,
    priceList: site.priceList?.name ?? null,
    stockValue: value === null ? null : value.toFixed(2),
    state: stateOf(site, defaultSiteId),
  };
}

export type SiteListState = "open" | "closed" | "any";

/**
 * Every site of the shop with what the list shows. `canSeeCost` false leaves
 * the stock value out, totals included.
 */
export async function listSites(
  companyId: string,
  options: { state?: SiteListState; q?: string | null; canSeeCost: boolean },
): Promise<{ data: SiteRow[]; totals: { count: number; tills: number; stockValue: string | null } }> {
  const state = options.state ?? "open";
  const q = (options.q ?? "").trim();
  const [sites, defaultSiteId] = await Promise.all([
    prisma.site.findMany({
      where: {
        companyId,
        ...(state === "open" ? { isActive: true } : state === "closed" ? { isActive: false } : {}),
        ...(q
          ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] }
          : {}),
      },
      orderBy: [{ name: "asc" }],
      select: siteSelect,
    }),
    defaultSiteIdOf(prisma, companyId),
  ]);
  const values = options.canSeeCost ? await stockValues(prisma, sites.map((site) => site.id)) : null;
  const data = sites.map((site) => rowOf(site, defaultSiteId, values ? (values.get(site.id) ?? 0) : null));
  return {
    data,
    totals: {
      count: data.length,
      tills: data.reduce((sum, row) => sum + row.tills, 0),
      stockValue: values ? data.reduce((sum, row) => sum + Number(row.stockValue ?? 0), 0).toFixed(2) : null,
    },
  };
}

/** One site with everything its sheet shows. */
export async function getSite(companyId: string, id: string, canSeeCost: boolean, client: Client = prisma): Promise<SiteDetail | null> {
  const site = await client.site.findFirst({ where: { id, companyId }, select: siteSelect });
  if (!site) return null;
  const [defaultSiteId, values, stocked] = await Promise.all([
    defaultSiteIdOf(client, companyId),
    canSeeCost ? stockValues(client, [site.id]) : Promise.resolve(null),
    client.inventoryItem.groupBy({
      by: ["locationId"],
      where: { siteId: site.id, currentStock: { not: 0 } },
      _count: true,
    }),
  ]);
  const holding = new Set(stocked.map((row) => row.locationId));
  const value = values ? (values.get(site.id) ?? 0) : null;
  const row = rowOf(site, defaultSiteId, value);
  return {
    ...row,
    phone: site.phone,
    address: site.location,
    openingHours: site.openingHours,
    priceListId: site.priceListId,
    placeList: site.stockLocations.map((place) => ({ id: place.id, name: place.name, hasStock: holding.has(place.id) })),
    isDefault: row.state === "DEFAULT",
    sub: siteSub({ isDefault: row.state === "DEFAULT", tills: row.tills, stockValue: value, closed: row.state === "CLOSED" }),
  };
}

/** The shop's plan and how many open sites it has; null when its plan sets no limit or it has none. */
export async function planRoom(client: Client, companyId: string): Promise<PlanRoom | null> {
  const [subscription, openSites] = await Promise.all([
    client.companySubscription.findFirst({
      where: { companyId, status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
      orderBy: { createdAt: "desc" },
      select: { plan: { select: { name: true, maxSites: true } } },
    }),
    client.site.count({ where: { companyId, isActive: true } }),
  ]);
  if (!subscription) return null;
  return { name: subscription.plan.name, maxSites: subscription.plan.maxSites, openSites };
}

/** The price lists a site may sell from: "Default, 214 products", "96 products". */
export async function priceListOptions(companyId: string, client: Client = prisma): Promise<{
  options: PriceListOption[];
  defaultId: string | null;
}> {
  const [lists, active] = await Promise.all([
    client.priceList.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    activeRetailPriceList(companyId),
  ]);
  const counts = await client.productPrice.groupBy({
    by: ["priceListId", "productId"],
    where: { companyId, priceListId: { in: lists.map((list) => list.id) } },
  });
  const products = new Map<string, number>();
  for (const row of counts) products.set(row.priceListId, (products.get(row.priceListId) ?? 0) + 1);
  const defaultId = active?.id ?? lists[0]?.id ?? null;
  const ordered = [...lists].sort((a, b) => Number(b.id === defaultId) - Number(a.id === defaultId));
  return {
    defaultId,
    options: ordered.map((list) => {
      const count = products.get(list.id) ?? 0;
      const words = `${count} ${count === 1 ? "product" : "products"}`;
      return { id: list.id, name: list.name, sub: list.id === defaultId ? `Default, ${words}` : words };
    }),
  };
}

/** What Add a site needs before it opens. */
export async function siteNewContext(companyId: string, name?: string | null): Promise<SiteNewContext> {
  const [lists, sites, defaultSiteId, plan] = await Promise.all([
    priceListOptions(companyId),
    prisma.site.findMany({ where: { companyId }, orderBy: [{ name: "asc" }], select: { id: true, name: true, code: true, isActive: true } }),
    defaultSiteIdOf(prisma, companyId),
    planRoom(prisma, companyId),
  ]);
  const takenCodes = sites.map((site) => site.code);
  const open = sites.filter((site) => site.isActive);
  return {
    priceLists: lists.options,
    otherSites: [...open]
      .sort((a, b) => Number(b.id === defaultSiteId) - Number(a.id === defaultSiteId))
      .map((site) => ({ id: site.id, name: site.name })),
    plan: plan && plan.maxSites !== null ? { name: plan.name, maxSites: plan.maxSites, openSites: plan.openSites } : null,
    suggestedCode: suggestSiteCode(name ?? "", takenCodes),
    takenCodes,
    defaultPriceListId: lists.defaultId,
  };
}

/* ── Rules shared by the writes ───────────────────────────────────────────── */

async function checkName(tx: Prisma.TransactionClient, companyId: string, name: string, exceptId: string | null) {
  const clash = await tx.site.findFirst({
    where: { companyId, isActive: true, name: { equals: name, mode: "insensitive" }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (clash) throw new SiteRefusal(409, `There is already a site called ${clash.name}.`, { field: "name" });
}

async function checkCode(tx: Prisma.TransactionClient, companyId: string, code: string, exceptId: string | null) {
  const clash = await tx.site.findFirst({
    where: { companyId, code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (clash) throw new SiteRefusal(409, `${clash.name} already has the code ${code}.`, { field: "code" });
}

async function checkPriceList(tx: Prisma.TransactionClient, companyId: string, priceListId: string) {
  const list = await tx.priceList.findFirst({ where: { id: priceListId, companyId, isActive: true }, select: { name: true } });
  if (!list) throw new SiteRefusal(400, "Choose one of your price lists.", { field: "priceListId" });
  return list.name;
}

/** A refusal for a unique index raced past the checks. */
function raced(error: unknown, code: string | undefined): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new SiteRefusal(409, `Another site already has the code ${code ?? "you chose"}.`, { field: "code" });
  }
  throw error;
}

const canSeeCostOf = (actor: { canSeeCost?: boolean }) => actor.canSeeCost ?? false;

export type SiteActor = RetailAuditActor & { canSeeCost?: boolean };

/* ── Add a site (W-03) ────────────────────────────────────────────────────── */

export async function createSite(actor: SiteActor, input: SiteInput): Promise<SiteDetail> {
  const { companyId } = actor;
  try {
    const id = await prisma.$transaction(async (tx) => {
      const plan = await planRoom(tx, companyId);
      if (plan && plan.maxSites !== null && plan.openSites >= plan.maxSites) {
        throw new SiteRefusal(409, noRoomSentence(plan.name), { code: "PLAN_LIMIT" });
      }
      await checkName(tx, companyId, input.name, null);
      await checkCode(tx, companyId, input.code, null);
      const priceList = await checkPriceList(tx, companyId, input.priceListId);

      const site = await tx.site.create({
        data: {
          companyId,
          name: input.name,
          code: input.code,
          location: input.address,
          phone: input.phone,
          openingHours: input.openingHours,
          priceListId: input.priceListId,
          isActive: true,
        },
        select: { id: true },
      });
      const codes: string[] = [];
      for (const [index, place] of input.places.entries()) {
        const code = placeCode(place.name, codes);
        codes.push(code);
        await tx.stockLocation.create({ data: { siteId: site.id, code, name: place.name, sortOrder: index } });
      }

      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.siteCreated,
        entityType: "Site",
        entityId: site.id,
        payload: { name: input.name, code: input.code, places: input.places.map((place) => place.name), priceList },
      });
      return site.id;
    });
    return (await getSite(companyId, id, canSeeCostOf(actor)))!;
  } catch (error) {
    if (error instanceof SiteRefusal) throw error;
    return raced(error, input.code);
  }
}

/* ── Change a site, its places and the default (W-66) ─────────────────────── */

type PlaceDiff = { added: string[]; removed: string[]; stockMoved: number };

/**
 * The places as the owner left them: the ones kept (renamed where the name
 * changed), the new ones, and the removed ones' stock on the first place that
 * remains before they go.
 */
async function applyPlaces(
  tx: Prisma.TransactionClient,
  actor: SiteActor,
  site: { id: string },
  places: Array<{ id?: string; name: string }>,
): Promise<PlaceDiff> {
  const all = await tx.stockLocation.findMany({
    where: { siteId: site.id },
    select: { id: true, code: true, name: true, isActive: true },
  });
  const active = all.filter((place) => place.isActive);
  const codes = all.map((place) => place.code);
  const kept = new Set<string>();
  const order: string[] = [];
  const added: string[] = [];

  for (const place of places) {
    // A known id must be one of this site's places; without one, a place already there under that name.
    const existing = place.id
      ? active.find((row) => row.id === place.id)
      : active.find((row) => !kept.has(row.id) && row.name.toLowerCase() === place.name.toLowerCase());
    if (place.id && (!existing || kept.has(existing.id))) {
      throw new SiteRefusal(400, "One of those places is not at this site.", { field: "places" });
    }
    if (existing) {
      kept.add(existing.id);
      order.push(existing.id);
      if (existing.name !== place.name) await tx.stockLocation.update({ where: { id: existing.id }, data: { name: place.name } });
      continue;
    }
    // A place removed before comes back under its old code.
    const returning = all.find((row) => !row.isActive && row.name.toLowerCase() === place.name.toLowerCase());
    if (returning) {
      await tx.stockLocation.update({ where: { id: returning.id }, data: { isActive: true, name: place.name } });
      kept.add(returning.id);
      order.push(returning.id);
    } else {
      const code = placeCode(place.name, codes);
      codes.push(code);
      const created = await tx.stockLocation.create({ data: { siteId: site.id, code, name: place.name }, select: { id: true } });
      kept.add(created.id);
      order.push(created.id);
    }
    added.push(place.name);
  }

  for (const [index, id] of order.entries()) {
    await tx.stockLocation.update({ where: { id }, data: { sortOrder: index } });
  }

  const removed = active.filter((place) => !kept.has(place.id));
  const first = order[0]!;
  let stockMoved = 0;
  for (const place of removed) {
    const lines = await tx.inventoryItem.findMany({
      where: { siteId: site.id, locationId: place.id },
      select: { id: true, unit: true, currentStock: true },
    });
    for (const line of lines) {
      if (line.currentStock.isZero()) {
        await tx.inventoryItem.update({ where: { id: line.id }, data: { locationId: first } });
        continue;
      }
      // "Removing a place moves its stock to the shop floor": the whole line, as a transfer.
      await recordStockMovement({
        tx,
        companyId: actor.companyId,
        userId: actor.userId,
        itemId: line.id,
        movementType: "TRANSFER",
        quantity: line.currentStock,
        unit: line.unit,
        toLocationId: first,
        reason: "PLACE_MOVE",
        reference: null,
        notes: `Place ${place.name} removed`,
        sourceType: "RETAIL_STOCK_TRANSFER",
        sourceId: site.id,
      });
      stockMoved += 1;
    }
    await tx.stockLocation.update({ where: { id: place.id }, data: { isActive: false } });
  }

  return { added, removed: removed.map((place) => place.name), stockMoved };
}

export async function updateSite(actor: SiteActor, id: string, patch: SitePatch): Promise<SiteDetail> {
  const { companyId } = actor;
  try {
    await prisma.$transaction(async (tx) => {
      const site = await tx.site.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          name: true,
          code: true,
          location: true,
          phone: true,
          openingHours: true,
          priceListId: true,
          isActive: true,
          priceList: { select: { name: true } },
        },
      });
      if (!site) throw new SiteRefusal(404, NOT_FOUND);
      if (!site.isActive) throw new SiteRefusal(409, `${site.name} is closed. A closed site keeps its details as they were.`);

      const defaultSiteId = await defaultSiteIdOf(tx, companyId);
      if (patch.isDefault === false && defaultSiteId === site.id) {
        throw new SiteRefusal(409, "Make another site the default first.", { code: "DEFAULT_SITE" });
      }

      const changes: Record<string, { from: string | null; to: string | null }> = {};
      const data: Prisma.SiteUpdateInput = {};
      const note = (key: string, from: string | null, to: string | null) => {
        if ((from ?? null) !== (to ?? null)) changes[key] = { from: from ?? null, to: to ?? null };
      };

      if (patch.name !== undefined && patch.name !== site.name) {
        await checkName(tx, companyId, patch.name, site.id);
        data.name = patch.name;
        note("name", site.name, patch.name);
      }
      if (patch.code !== undefined && patch.code !== site.code) {
        await checkCode(tx, companyId, patch.code, site.id);
        data.code = patch.code;
        note("code", site.code, patch.code);
      }
      if (patch.phone !== undefined) {
        data.phone = patch.phone;
        note("phone", site.phone, patch.phone);
      }
      if (patch.address !== undefined) {
        data.location = patch.address;
        note("address", site.location, patch.address);
      }
      if (patch.openingHours !== undefined) {
        data.openingHours = patch.openingHours;
        note("openingHours", site.openingHours, patch.openingHours);
      }
      if (patch.priceListId !== undefined && patch.priceListId !== site.priceListId) {
        const name = await checkPriceList(tx, companyId, patch.priceListId);
        data.priceList = { connect: { id: patch.priceListId } };
        note("priceList", site.priceList?.name ?? null, name);
      }
      if (Object.keys(data).length > 0) await tx.site.update({ where: { id: site.id }, data });

      let madeDefault = false;
      if (patch.isDefault === true && defaultSiteId !== site.id) {
        await tx.retailShopProfile.upsert({
          where: { companyId },
          create: { companyId, defaultSiteId: site.id, updatedById: actor.userId },
          update: { defaultSiteId: site.id, updatedById: actor.userId },
        });
        madeDefault = true;
      }

      const places = patch.places ? await applyPlaces(tx, actor, site, patch.places) : null;
      const placesChanged = places !== null && (places.added.length > 0 || places.removed.length > 0);

      if (Object.keys(changes).length > 0 || madeDefault || placesChanged) {
        await writeRetailAuditEvent(tx, {
          actor,
          eventType: RETAIL_AUDIT_EVENTS.siteChanged,
          entityType: "Site",
          entityId: site.id,
          payload: {
            name: patch.name ?? site.name,
            changes,
            ...(madeDefault ? { madeDefault: true } : {}),
            placesAdded: places?.added ?? [],
            placesRemoved: places?.removed ?? [],
            stockMoved: places?.stockMoved ?? 0,
          },
        });
      }
    });
    return (await getSite(companyId, id, canSeeCostOf(actor)))!;
  } catch (error) {
    if (error instanceof SiteRefusal) throw error;
    return raced(error, patch.code);
  }
}

/* ── Close a site ─────────────────────────────────────────────────────────── */

/** "3 products still have stock here. Move them or count them to zero first." */
export function hasStockSentence(n: number): string {
  return n === 1
    ? "1 product still has stock here. Move it or count it to zero first."
    : `${n} products still have stock here. Move them or count them to zero first.`;
}

export async function closeSite(actor: SiteActor, id: string): Promise<SiteDetail> {
  const { companyId } = actor;
  await prisma.$transaction(async (tx) => {
    const site = await tx.site.findFirst({ where: { id, companyId }, select: { id: true, name: true, code: true, isActive: true } });
    if (!site) throw new SiteRefusal(404, NOT_FOUND);
    if (!site.isActive) throw new SiteRefusal(409, `${site.name} is already closed.`);
    if ((await defaultSiteIdOf(tx, companyId)) === site.id) {
      throw new SiteRefusal(409, "Make another site the default first.", { code: "DEFAULT_SITE" });
    }
    const openShifts = await tx.retailShift.count({ where: { companyId, siteId: site.id, status: "OPEN" } });
    if (openShifts > 0) throw new SiteRefusal(409, "Close the open shifts here first.", { code: "SHIFT_OPEN" });
    const stocked = await tx.inventoryItem.count({ where: { siteId: site.id, currentStock: { not: 0 } } });
    if (stocked > 0) throw new SiteRefusal(409, hasStockSentence(stocked), { code: "HAS_STOCK" });

    // Its tills stop: nothing sells there once it is closed.
    const tills = await tx.retailRegister.updateMany({
      where: { companyId, siteId: site.id, isActive: true },
      data: { isActive: false },
    });
    await tx.site.update({
      where: { id: site.id },
      data: { isActive: false, closedAt: new Date(), closedById: actor.userId },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.siteClosed,
      entityType: "Site",
      entityId: site.id,
      payload: { name: site.name, code: site.code, tillsStopped: tills.count },
    });
  });
  return (await getSite(companyId, id, canSeeCostOf(actor)))!;
}
