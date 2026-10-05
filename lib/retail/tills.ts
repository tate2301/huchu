import { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import {
  PairingRefusal,
  checkTillRoom,
  expirePairingCodes,
  issuePairingCode,
  pairingState,
  type PairingPurpose,
  type PairingState,
} from "@/lib/retail/pairing";
import { activeRetailPriceList } from "@/lib/retail/shelf-pricing";
import {
  MOVE_SHIFT_OPEN,
  deviceWords,
  lastSaleWords,
  nameTakenSentence,
  pairedWords,
  lastSeenWords,
  suggestTillName,
  tillState,
  tillSub,
  unpairShiftOpen,
  type DeviceKind,
  type TillState,
} from "@/lib/retail/till-words";
import { DEFAULT_TIME_ZONE, formatTime } from "@/lib/workspace/format";

/**
 * Tills and the devices that run them (10-setup W-04, W-76, 4.3).
 *
 * A till (`RetailRegister`) is where money is taken: its drawer, float,
 * shifts and Z report. A device (`RetailDevice`) is what runs Tender at it —
 * a CounterMini, a Kora handheld or a browser — one active device per till.
 * The back office makes tills, issues the code a device pairs with, swaps a
 * device for another, unpairs one, and sends a till a message.
 *
 * Shifts still name their till by `registerCode` (the device side, SET-04,
 * gives them `registerId`), so what is open on a till and when it last sold
 * are read through the code.
 */

export { PairingRefusal as TillRefusal } from "@/lib/retail/pairing";

export type DeviceSummary = {
  id: string;
  kind: DeviceKind;
  /** "Browser, Windows PC", "CounterMini". */
  label: string;
  appVersion: string | null;
  lastSeenAt: string | null;
  /** "Now, version 4.12.0", "11:38, version 4.12.0", "Yesterday, 21:55". */
  lastSeen: string;
  /** Last seen without the version: "11:38", "Now", "Yesterday, 21:55". */
  seen: string;
  pairedAt: string;
  pairedBy: string;
  /** "2 August 2026 by Tafara Nyathi". */
  paired: string;
};

export type TillRow = {
  id: string;
  name: string;
  code: string;
  /** `isDefault`: the shop's default site, listed first. */
  site: { id: string; name: string; isDefault: boolean };
  /** "CounterMini", "Kora", "Browser, Windows PC", "No device yet". */
  device: string;
  /** What the paired device is; null with none. */
  pairedKind: DeviceKind | null;
  lastSaleAt: string | null;
  /** "Today, 11:42". */
  lastSale: string | null;
  onItNow: string | null;
  state: TillState;
  /** "Selling", "Closed", "Offline 2 hours", "Not paired". */
  stateLabel: string;
};

export type TillDetail = TillRow & {
  deviceKind: DeviceKind;
  priceListId: string | null;
  /** The list the till sells from when it names none: its site's, else the shop's. */
  sitePriceList: string | null;
  hasPrinter: boolean;
  hasDrawer: boolean;
  hasScale: boolean;
  current: DeviceSummary | null;
  /** `since` is the time it opened, "07:55". */
  openShift: { id: string; cashier: string; openedAt: string; since: string } | null;
  /** The shop's active price lists, for "Sells from price list". */
  priceLists: Array<{ id: string; name: string }>;
  /** "Harare Main Branch · CounterMini · selling now". */
  sub: string;
  /** Open sites: Site is asked only with two or more. */
  siteCount: number;
};

/* ── Input ────────────────────────────────────────────────────────────────── */

const deviceKind = z.enum(["COUNTER_MINI", "KORA", "BROWSER"], { error: "Choose CounterMini, Kora handheld or a browser." });
const tillName = z.string().trim().min(1, "Name is needed.").max(60, "Keep the name to 60 characters.");

export const tillInput = z.object({
  name: tillName.optional(),
  siteId: z.string().uuid("Choose a site.").optional(),
  deviceKind: deviceKind.default("COUNTER_MINI"),
});
export type TillInput = z.infer<typeof tillInput>;

export const tillPatch = z
  .object({
    name: tillName,
    siteId: z.string().uuid("Choose a site."),
    deviceKind,
    priceListId: z.string().uuid("Choose a price list.").nullable(),
    hasPrinter: z.boolean(),
    hasDrawer: z.boolean(),
    hasScale: z.boolean(),
  })
  .partial();
export type TillPatch = z.infer<typeof tillPatch>;

export const pairingCodeInput = z.object({
  purpose: z.enum(["PAIR", "REPLACE"], { error: "Say whether the code pairs a till or replaces its device." }).default("PAIR"),
}, { error: "Say whether the code pairs a till or replaces its device." });

export const tillMessageInput = z.object({
  tillIds: z
    .array(z.string().uuid("Choose the tills."), { error: "Choose the tills." })
    .min(1, "Choose the tills.")
    .max(100, "Send to at most 100 tills at once."),
  body: z.string({ error: "Write the message." }).trim().min(1, "Write the message.").max(280, "Keep the message to 280 characters."),
}, { error: "Send the tills and the message." });

/** The zod issues as `{ field: sentence }`, first issue per field. */
export function tillFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/* ── Reading ──────────────────────────────────────────────────────────────── */

type Client = Prisma.TransactionClient | typeof prisma;

const NOT_FOUND = "That till is not one of this shop's.";

const tillSelect = {
  id: true,
  name: true,
  code: true,
  siteId: true,
  deviceKind: true,
  priceListId: true,
  hasPrinter: true,
  hasDrawer: true,
  hasScale: true,
  site: {
    select: { id: true, name: true, priceList: { select: { name: true } }, _count: { select: { retailDefaultFor: true } } },
  },
  devices: {
    where: { unpairedAt: null },
    take: 1,
    select: {
      id: true,
      kind: true,
      label: true,
      appVersion: true,
      lastSeenAt: true,
      pairedAt: true,
      pairedBy: { select: { name: true } },
    },
  },
} satisfies Prisma.RetailRegisterSelect;

type TillRecord = Prisma.RetailRegisterGetPayload<{ select: typeof tillSelect }>;
type OpenShift = { id: string; cashierName: string; openedAt: Date };

/** The shift open on each till, by till code. */
async function openShifts(client: Client, companyId: string): Promise<Map<string, OpenShift>> {
  const shifts = await client.retailShift.findMany({
    where: { companyId, status: "OPEN" },
    orderBy: { openedAt: "asc" },
    select: { id: true, registerCode: true, cashierName: true, openedAt: true },
  });
  // The latest one wins, should a till ever hold two.
  return new Map(shifts.map((shift) => [shift.registerCode, shift]));
}

/** When each till last sold, by till code, through the shifts that name it. */
async function lastSales(client: Client, companyId: string): Promise<Map<string, Date>> {
  const rows = await client.$queryRaw<Array<{ code: string; at: Date | null }>>`
    SELECT sh."registerCode" AS code, MAX(s."postedAt") AS at
    FROM "RetailSale" s
    JOIN "RetailShift" sh ON sh."id" = s."shiftId"
    WHERE s."companyId" = ${companyId} AND s."saleType" = 'SALE'
    GROUP BY sh."registerCode"`;
  return new Map(rows.filter((row) => row.at).map((row) => [row.code, row.at as Date]));
}

function summary(device: TillRecord["devices"][number] | undefined, now: Date): DeviceSummary | null {
  if (!device) return null;
  const pairedBy = device.pairedBy.name ?? "";
  return {
    id: device.id,
    kind: device.kind,
    label: deviceWords(device),
    appVersion: device.appVersion,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastSeen: lastSeenWords(device.lastSeenAt, device.appVersion, now, DEFAULT_TIME_ZONE),
    seen: lastSeenWords(device.lastSeenAt, null, now, DEFAULT_TIME_ZONE),
    pairedAt: device.pairedAt.toISOString(),
    pairedBy,
    paired: pairedWords(device.pairedAt, pairedBy, DEFAULT_TIME_ZONE),
  };
}

function rowOf(till: TillRecord, shift: OpenShift | undefined, lastSale: Date | undefined, now: Date): TillRow {
  const device = till.devices[0] ?? null;
  const state = tillState({ device: device ? { kind: device.kind, lastSeenAt: device.lastSeenAt } : null, shiftOpen: Boolean(shift) }, now);
  return {
    id: till.id,
    name: till.name,
    code: till.code,
    site: { id: till.site.id, name: till.site.name, isDefault: till.site._count.retailDefaultFor > 0 },
    device: deviceWords(device),
    pairedKind: device?.kind ?? null,
    lastSaleAt: lastSale?.toISOString() ?? null,
    lastSale: lastSale ? lastSaleWords(lastSale, now, DEFAULT_TIME_ZONE) : null,
    onItNow: shift?.cashierName ?? null,
    state: state.state,
    stateLabel: state.label,
  };
}

export type TillFilters = { siteId?: string | null; state?: TillState | null; q?: string | null };

/** Every working till of the shop — the default site's first, then by site and name — with what the list shows. */
export async function listTills(
  companyId: string,
  filters: TillFilters = {},
  now: Date = new Date(),
): Promise<{ data: TillRow[]; totals: { count: number } }> {
  const q = (filters.q ?? "").trim().toLowerCase();
  const [tills, shifts, sales] = await Promise.all([
    prisma.retailRegister.findMany({
      where: { companyId, isActive: true, ...(filters.siteId ? { siteId: filters.siteId } : {}) },
      orderBy: [{ site: { name: "asc" } }, { name: "asc" }],
      select: tillSelect,
    }),
    openShifts(prisma, companyId),
    lastSales(prisma, companyId),
  ]);
  const data = tills
    .map((till) => rowOf(till, shifts.get(till.code), sales.get(till.code), now))
    // Stable: within each site the query's name order stays.
    .sort((a, b) => Number(b.site.isDefault) - Number(a.site.isDefault))
    .filter((row) => !filters.state || row.state === filters.state)
    .filter((row) => !q || row.name.toLowerCase().includes(q) || row.device.toLowerCase().includes(q));
  return { data, totals: { count: data.length } };
}

/** One till with everything its sheet shows. */
export async function getTill(companyId: string, id: string, now: Date = new Date(), client: Client = prisma): Promise<TillDetail | null> {
  const till = await client.retailRegister.findFirst({ where: { id, companyId, isActive: true }, select: tillSelect });
  if (!till) return null;
  const [shifts, sales, siteCount, shopList, priceLists] = await Promise.all([
    openShifts(client, companyId),
    lastSales(client, companyId),
    client.site.count({ where: { companyId, isActive: true } }),
    till.site.priceList ? Promise.resolve(null) : activeRetailPriceList(companyId),
    client.priceList.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  const shift = shifts.get(till.code);
  const row = rowOf(till, shift, sales.get(till.code), now);
  const current = summary(till.devices[0], now);
  return {
    ...row,
    deviceKind: till.deviceKind,
    priceListId: till.priceListId,
    sitePriceList: till.site.priceList?.name ?? shopList?.name ?? null,
    hasPrinter: till.hasPrinter,
    hasDrawer: till.hasDrawer,
    hasScale: till.hasScale,
    current,
    openShift: shift
      ? { id: shift.id, cashier: shift.cashierName, openedAt: shift.openedAt.toISOString(), since: formatTime(shift.openedAt, DEFAULT_TIME_ZONE) }
      : null,
    priceLists,
    sub: tillSub(till.site.name, current ? row.device : null, { state: row.state, label: row.stateLabel }),
    siteCount,
  };
}

async function requireTill(client: Client, companyId: string, id: string) {
  const till = await client.retailRegister.findFirst({
    where: { id, companyId, isActive: true },
    select: { id: true, name: true, code: true, siteId: true, site: { select: { name: true } } },
  });
  if (!till) throw new PairingRefusal(404, NOT_FOUND);
  return till;
}

/* ── Rules shared by the writes ───────────────────────────────────────────── */

async function openSite(client: Client, companyId: string, siteId: string | null | undefined) {
  if (siteId) {
    const site = await client.site.findFirst({ where: { id: siteId, companyId, isActive: true }, select: { id: true, name: true } });
    if (!site) throw new PairingRefusal(400, "Choose one of your open sites.", { field: "siteId" });
    return site;
  }
  const profile = await client.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } });
  const site =
    (profile?.defaultSiteId
      ? await client.site.findFirst({ where: { id: profile.defaultSiteId, companyId, isActive: true }, select: { id: true, name: true } })
      : null) ??
    (await client.site.findFirst({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }));
  if (!site) throw new PairingRefusal(409, "Add a site first. A till sells at a site.", { code: "NO_SITE" });
  return site;
}

async function checkName(client: Client, companyId: string, siteId: string, siteName: string, name: string, exceptId: string | null) {
  const clash = await client.retailRegister.findFirst({
    where: {
      companyId,
      siteId,
      isActive: true,
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { name: true },
  });
  if (clash) throw new PairingRefusal(409, nameTakenSentence(clash.name, siteName), { field: "name" });
}

const TILL_CODE = /^TILL-(\d+)$/i;

/** "TILL-1", "TILL-2", "REG-0001" → the code after the highest TILL-<n>. Unique to the shop, whatever the site. */
export function nextTillCode(codes: readonly string[]): string {
  const highest = codes.reduce((max, code) => {
    const match = TILL_CODE.exec(code.trim());
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `TILL-${highest + 1}`;
}

/** The till's code: the shop's next `TILL-<n>`. A race for it ends in P2002, which the caller retries. */
async function freeTillCode(client: Client, companyId: string): Promise<string> {
  const existing = await client.retailRegister.findMany({ where: { companyId }, select: { code: true } });
  return nextTillCode(existing.map((row) => row.code));
}

const raced = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

const openShiftOn = (client: Client, companyId: string, code: string) =>
  client.retailShift.findFirst({ where: { companyId, registerCode: code, status: "OPEN" }, select: { cashierName: true } });

/* ── Pair a till (W-04) ───────────────────────────────────────────────────── */

/**
 * Opening Pair a till makes the till and its first code: the name suggested
 * ("Till 6") unless given, the default site unless given, printer and drawer
 * on, scale off. 409 PLAN_LIMIT when every till the plan allows is paired.
 * Nothing is audited until Done saves it.
 */
export async function createTill(
  actor: RetailAuditActor,
  input: TillInput,
  now: Date = new Date(),
): Promise<{ data: TillDetail; code: string; expiresAt: string }> {
  const { companyId } = actor;
  const attempt = () =>
    prisma.$transaction(async (tx) => {
      await checkTillRoom(tx, companyId);
      const site = await openSite(tx, companyId, input.siteId);
      const names = await tx.retailRegister.findMany({ where: { companyId, isActive: true }, select: { name: true } });
      const name = input.name ?? suggestTillName(names.map((row) => row.name));
      await checkName(tx, companyId, site.id, site.name, name, null);
      const till = await tx.retailRegister.create({
        data: {
          companyId,
          siteId: site.id,
          code: await freeTillCode(tx, companyId),
          name,
          deviceKind: input.deviceKind,
          createdById: actor.userId,
        },
        select: { id: true },
      });
      const code = await issuePairingCode(tx, { companyId, registerId: till.id, purpose: "PAIR", createdById: actor.userId }, now);
      return { id: till.id, ...code };
    });
  let issued: Awaited<ReturnType<typeof attempt>> | null = null;
  // Two people pairing at once race for the next code.
  for (let tries = 0; !issued; tries += 1) {
    try {
      issued = await attempt();
    } catch (error) {
      if (!raced(error) || tries >= 4) throw error;
    }
  }
  return { data: (await getTill(companyId, issued.id, now))!, code: issued.code, expiresAt: issued.expiresAt.toISOString() };
}

/* ── Change a till ────────────────────────────────────────────────────────── */

const KIND_AUDIT: Record<DeviceKind, string> = { COUNTER_MINI: "CounterMini", KORA: "Kora handheld", BROWSER: "A browser" };

/**
 * Name, site, the device it is meant for, its price list and what is
 * plugged in. Moving it to another site while a shift is open on it is
 * refused (SHIFT_OPEN). The first save after Pair a till records it as
 * created; later ones as changed, with each field before and after.
 */
export async function updateTill(actor: RetailAuditActor, id: string, patch: TillPatch, now: Date = new Date()): Promise<TillDetail> {
  const { companyId } = actor;
  await prisma.$transaction(async (tx) => {
    const till = await tx.retailRegister.findFirst({
      where: { id, companyId, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        siteId: true,
        deviceKind: true,
        priceListId: true,
        hasPrinter: true,
        hasDrawer: true,
        hasScale: true,
        createdById: true,
        site: { select: { name: true } },
        priceList: { select: { name: true } },
      },
    });
    if (!till) throw new PairingRefusal(404, NOT_FOUND);

    const changes: Record<string, { from: string | boolean | null; to: string | boolean | null }> = {};
    const data: Prisma.RetailRegisterUncheckedUpdateInput = {};
    const note = (key: string, from: string | boolean | null, to: string | boolean | null) => {
      if (from !== to) changes[key] = { from, to };
    };

    let siteName = till.site.name;
    let siteId = till.siteId;
    if (patch.siteId !== undefined && patch.siteId !== till.siteId) {
      if (await openShiftOn(tx, companyId, till.code)) throw new PairingRefusal(409, MOVE_SHIFT_OPEN, { field: "siteId", code: "SHIFT_OPEN" });
      const site = await openSite(tx, companyId, patch.siteId);
      data.siteId = site.id;
      siteId = site.id;
      note("site", till.site.name, site.name);
      siteName = site.name;
    }
    const name = patch.name ?? till.name;
    if (name !== till.name || siteId !== till.siteId) await checkName(tx, companyId, siteId, siteName, name, till.id);
    if (patch.name !== undefined && patch.name !== till.name) {
      data.name = patch.name;
      note("name", till.name, patch.name);
    }
    if (patch.deviceKind !== undefined && patch.deviceKind !== till.deviceKind) {
      data.deviceKind = patch.deviceKind;
      note("device", KIND_AUDIT[till.deviceKind], KIND_AUDIT[patch.deviceKind]);
    }
    if (patch.priceListId !== undefined && patch.priceListId !== till.priceListId) {
      let listName: string | null = null;
      if (patch.priceListId) {
        const list = await tx.priceList.findFirst({ where: { id: patch.priceListId, companyId, isActive: true }, select: { name: true } });
        if (!list) throw new PairingRefusal(400, "Choose one of your price lists.", { field: "priceListId" });
        listName = list.name;
      }
      data.priceListId = patch.priceListId;
      note("priceList", till.priceList?.name ?? null, listName);
    }
    for (const key of ["hasPrinter", "hasDrawer", "hasScale"] as const) {
      if (patch[key] !== undefined && patch[key] !== till[key]) {
        data[key] = patch[key];
        note(key, till[key], patch[key]!);
      }
    }
    if (Object.keys(data).length > 0) await tx.retailRegister.update({ where: { id: till.id }, data });

    // A till made on Pair a till is recorded when Done first saves it.
    const recorded =
      !till.createdById ||
      (await tx.platformAuditEvent.findFirst({
        where: { companyId, entityType: "RetailRegister", entityId: till.id, eventType: RETAIL_AUDIT_EVENTS.tillCreated },
        select: { id: true },
      }));
    if (!recorded) {
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.tillCreated,
        entityType: "RetailRegister",
        entityId: till.id,
        payload: { name, code: till.code, site: siteName, device: KIND_AUDIT[patch.deviceKind ?? till.deviceKind] },
      });
    } else if (Object.keys(changes).length > 0) {
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.tillChanged,
        entityType: "RetailRegister",
        entityId: till.id,
        payload: { name, changes },
      });
    }
  });
  return (await getTill(companyId, id, now))!;
}

/* ── Cancel on Pair a till ────────────────────────────────────────────────── */

/**
 * Only a till that never paired and has no shifts or sales goes (its codes
 * and messages with it); anything else has history and stays. Nothing is
 * audited: the till was never saved.
 */
export async function deleteTill(actor: RetailAuditActor, id: string): Promise<void> {
  const { companyId } = actor;
  await prisma.$transaction(async (tx) => {
    const till = await requireTill(tx, companyId, id);
    const [devices, shifts] = await Promise.all([
      tx.retailDevice.count({ where: { registerId: till.id } }),
      tx.retailShift.count({ where: { companyId, registerCode: till.code } }),
    ]);
    if (devices > 0 || shifts > 0) {
      throw new PairingRefusal(409, `${till.name} has been used, so it stays. Unpair its device instead.`, { code: "TILL_USED" });
    }
    await tx.retailRegister.delete({ where: { id: till.id } });
  });
}

/* ── Codes and pairing state ──────────────────────────────────────────────── */

/**
 * A fresh code: `PAIR` for a till with no device, `REPLACE` for one that has
 * a device to swap. A `PAIR` code is a till more on the plan, so it is
 * refused when every till the plan allows is paired.
 */
export async function issueTillCode(
  actor: RetailAuditActor,
  id: string,
  purpose: PairingPurpose,
  now: Date = new Date(),
): Promise<{ code: string; expiresAt: string }> {
  const { companyId } = actor;
  const issued = await prisma.$transaction(async (tx) => {
    const till = await requireTill(tx, companyId, id);
    const device = await tx.retailDevice.findFirst({ where: { registerId: till.id, unpairedAt: null }, select: { id: true } });
    if (purpose === "PAIR" && device) {
      throw new PairingRefusal(409, `${till.name} is paired already. Pair another device to swap it.`, { code: "PAIRED" });
    }
    if (purpose === "REPLACE" && !device) {
      throw new PairingRefusal(409, `${till.name} has no device to swap. Pair a device to it instead.`, { code: "NOT_PAIRED" });
    }
    if (purpose === "PAIR") await checkTillRoom(tx, companyId);
    return issuePairingCode(tx, { companyId, registerId: till.id, purpose, createdById: actor.userId }, now);
  });
  return { code: issued.code, expiresAt: issued.expiresAt.toISOString() };
}

/** Cancel: the till's live code stops working. */
export async function cancelTillCode(actor: RetailAuditActor, id: string, now: Date = new Date()): Promise<void> {
  const till = await requireTill(prisma, actor.companyId, id);
  await expirePairingCodes(prisma, till.id, now);
}

/** What the sheet polls every 2 seconds. */
export async function tillPairing(
  companyId: string,
  id: string,
  now: Date = new Date(),
): Promise<{ state: PairingState; expiresAt: string | null; device?: DeviceSummary }> {
  const till = await requireTill(prisma, companyId, id);
  const status = await pairingState(prisma, till.id, now);
  if (status.state !== "paired") return { state: status.state, expiresAt: status.expiresAt?.toISOString() ?? null };
  const detail = await getTill(companyId, till.id, now);
  return {
    state: "paired",
    expiresAt: status.expiresAt?.toISOString() ?? null,
    ...(detail?.current ? { device: detail.current } : {}),
  };
}

/* ── Unpair (W-76) ────────────────────────────────────────────────────────── */

/**
 * The device stops being a till at its next request; the till stays, ready
 * for another. Refused while a shift is open on it (SHIFT_OPEN): the drawer
 * has to be counted on the device that holds it.
 */
export async function unpairTill(actor: RetailAuditActor, id: string, now: Date = new Date()): Promise<TillDetail> {
  const { companyId } = actor;
  await prisma.$transaction(async (tx) => {
    const till = await requireTill(tx, companyId, id);
    const device = await tx.retailDevice.findFirst({
      where: { registerId: till.id, unpairedAt: null },
      select: { id: true, kind: true, label: true },
    });
    if (!device) throw new PairingRefusal(409, `${till.name} has no device to unpair.`, { code: "NOT_PAIRED" });
    const shift = await openShiftOn(tx, companyId, till.code);
    if (shift) throw new PairingRefusal(409, unpairShiftOpen(till.name, shift.cashierName), { code: "SHIFT_OPEN" });
    await tx.retailDevice.update({
      where: { id: device.id },
      data: { unpairedAt: now, unpairedById: actor.userId, unpairReason: "UNPAIRED" },
    });
    await expirePairingCodes(tx, till.id, now);
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.deviceUnpaired,
      entityType: "RetailRegister",
      entityId: till.id,
      payload: { name: till.name, device: deviceWords(device), deviceId: device.id, reason: "UNPAIRED" },
    });
  });
  return (await getTill(companyId, id, now))!;
}

/**
 * Every active device on these tills stops (a site closed, an account
 * closed), inside the caller's transaction. Returns how many.
 */
export async function unpairDevicesOf(
  tx: Prisma.TransactionClient,
  input: { companyId: string; registerIds: string[]; actorId: string; reason: "SITE_CLOSED" | "ACCOUNT_CLOSED" },
  now: Date = new Date(),
): Promise<number> {
  if (input.registerIds.length === 0) return 0;
  const result = await tx.retailDevice.updateMany({
    where: { companyId: input.companyId, registerId: { in: input.registerIds }, unpairedAt: null },
    data: { unpairedAt: now, unpairedById: input.actorId, unpairReason: input.reason },
  });
  await tx.retailPairingCode.updateMany({
    where: { registerId: { in: input.registerIds }, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now },
  });
  return result.count;
}

/* ── Send a message ───────────────────────────────────────────────────────── */

/** One message row per till; each shows on its till as a banner until dismissed. */
export async function sendTillMessages(actor: RetailAuditActor, tillIds: string[], body: string): Promise<{ sent: number }> {
  const { companyId } = actor;
  const ids = [...new Set(tillIds)];
  return prisma.$transaction(async (tx) => {
    const tills = await tx.retailRegister.findMany({ where: { id: { in: ids }, companyId, isActive: true }, select: { id: true, name: true } });
    if (tills.length !== ids.length) throw new PairingRefusal(400, "One of those tills is not one of this shop's.", { field: "tillIds" });
    await tx.retailDeviceMessage.createMany({
      data: tills.map((till) => ({ companyId, registerId: till.id, body, sentById: actor.userId })),
    });
    for (const till of tills) {
      await writeRetailAuditEvent(tx, {
        actor,
        eventType: RETAIL_AUDIT_EVENTS.tillMessageSent,
        entityType: "RetailRegister",
        entityId: till.id,
        payload: { name: till.name, body },
      });
    }
    return { sent: tills.length };
  });
}

export const isTillId = (id: string) => z.string().uuid().safeParse(id).success;

/* ── The `till` lookup's quick add ────────────────────────────────────────── */

export class TillNameTaken extends Error {
  constructor(name: string) {
    super(`There is already a till called ${name}.`);
    this.name = "TillNameTaken";
  }
}

export class NoSiteForTill extends Error {
  constructor() {
    super("Add a site before a till.");
    this.name = "NoSiteForTill";
  }
}

/**
 * "New till" from the `till` lookup: a till at the default site with the
 * next code, no code to pair with — Pair a device on its sheet makes one.
 */
export async function createRetailTill(companyId: string, rawName: string) {
  const name = rawName.trim();
  const site = await openSite(prisma, companyId, null).catch(() => null);
  if (!site) throw new NoSiteForTill();
  const taken = await prisma.retailRegister.findFirst({
    where: { companyId, isActive: true, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (taken) throw new TillNameTaken(name);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.retailRegister.create({
        data: { companyId, siteId: site.id, name, code: await freeTillCode(prisma, companyId), isActive: true },
        select: { id: true, code: true, name: true, siteId: true },
      });
    } catch (error) {
      if (!raced(error)) throw error;
    }
  }
  throw new Error("The till was not added. Try again.");
}
