import type { Prisma, RetailStockCountStatus } from "@prisma/client";
import { z } from "zod";

import { reserveIdentifier } from "@/lib/id-generator";
import { money, quantity } from "@/lib/money";
import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { approvalLink, notifyApprover } from "@/lib/retail/approvals/notify";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

import {
  alreadyCountingWords,
  beingCountedWords,
  countLinkText,
  countName,
  countPhrase,
  toGoWords,
  type CountScope,
  type CountStatus,
} from "./count-words";

/**
 * Counting stock (30-stock W-22 steps 1–2, 4.4): start a count of a shelf, a
 * category, some products, a place or everything; the counter counts it on a
 * phone, a figure at a time; then sends it for review. Nothing on hand moves
 * here: approving the differences is STK-06's.
 *
 * Each line's figure is weighed against on hand at the moment it arrives
 * (`expectedAtCount`), taken under the line's lock, so sales during a count
 * are allowed for line by line. A count that does not keep selling holds its
 * products back from the till until it is sent.
 */

export type CountActor = RetailAuditActor & { userName: string | null };

/** What the caller may do with counts, from the matrix. */
export type CountGrants = { view: boolean; update: boolean; approve: boolean; seeCost: boolean };

/** A refusal the route answers with its status: under fields (400) or as a sentence. */
export class CountRefusal extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly fieldErrors: Record<string, string> | null = null,
  ) {
    super(message);
    this.name = "CountRefusal";
  }
}

/** 409 at the till: a product held back by a count that does not keep selling. */
export class BeingCounted extends Error {
  readonly status = 409;
  constructor(product: string) {
    super(beingCountedWords(product));
    this.name = "BeingCounted";
  }
}

export const NOT_FOUND = "That count is not this shop’s.";
export const NOT_YOURS = "This count is not yours to count.";
export const CLOSED = "This count is closed.";
const OPEN_STATUSES: RetailStockCountStatus[] = ["COUNTING", "TO_APPROVE"];
const COUNT_LINK_TEMPLATE = "count-link";

/* ── What a count covers ─────────────────────────────────────────────────── */

export type CountScopeInput = {
  companyId: string;
  siteId: string;
  scope: CountScope;
  categoryIds?: string[];
  lineIds?: string[];
  placeId?: string | null;
};

export type CountableLine = {
  id: string;
  productId: string;
  product: string;
  shelf: string | null;
  onHand: Prisma.Decimal;
  unitCost: Prisma.Decimal | null;
};

/** The categories and every category inside them. */
async function withChildren(db: Prisma.TransactionClient | typeof prisma, companyId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const all = await db.retailCategory.findMany({ where: { companyId }, select: { id: true, parentId: true } });
  const found = new Set(ids.filter((id) => all.some((row) => row.id === id)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of all) {
      if (row.parentId && found.has(row.parentId) && !found.has(row.id)) {
        found.add(row.id);
        grew = true;
      }
    }
  }
  return [...found];
}

/**
 * The stock lines a count covers at its site, in the phone's order (shelf,
 * then product): lines of products not in the bin, an archived product's only
 * while it still holds stock. Everything: all of them; some categories: those
 * in them or inside them; some products: the given lines, if they are at the
 * site; a place: the lines kept there.
 */
export async function resolveCountLines(
  db: Prisma.TransactionClient | typeof prisma,
  input: CountScopeInput,
): Promise<CountableLine[]> {
  const where: Prisma.InventoryItemWhereInput = {
    siteId: input.siteId,
    site: { companyId: input.companyId },
    productId: { not: null },
    product: { is: { companyId: input.companyId, archivedAt: null } },
  };
  if (input.scope === "CATEGORIES") {
    const ids = await withChildren(db, input.companyId, input.categoryIds ?? []);
    if (ids.length === 0) return [];
    where.product = { is: { companyId: input.companyId, archivedAt: null, categoryId: { in: ids } } };
  } else if (input.scope === "PRODUCTS") {
    if (!input.lineIds?.length) return [];
    where.id = { in: input.lineIds };
  } else if (input.scope === "PLACE") {
    if (!input.placeId) return [];
    where.locationId = input.placeId;
  }
  const rows = await db.inventoryItem.findMany({
    where,
    select: {
      id: true,
      shelf: true,
      currentStock: true,
      unitCost: true,
      product: { select: { id: true, name: true, isActive: true } },
    },
  });
  return rows
    .filter((row) => row.product && (row.product.isActive || !row.currentStock.isZero()))
    .map((row) => ({
      id: row.id,
      productId: row.product!.id,
      product: row.product!.name,
      shelf: row.shelf,
      onHand: row.currentStock,
      unitCost: row.unitCost,
    }))
    .sort((a, b) => byCodePoint(sortKeyOf(a), sortKeyOf(b)));
}

/** Shelf, then product name: the phone's order; lines on no shelf ("~") come last. */
export const sortKeyOf = (line: { shelf: string | null; product: string }) => `${line.shelf?.trim() || "~"}|${line.product}`;

/** As the database orders `sortKey` (C collation): by code point, so "~" is after every shelf. */
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The shop's default site, else its first open one. */
async function defaultSiteId(companyId: string): Promise<string | null> {
  const profile = await prisma.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } });
  if (profile?.defaultSiteId) return profile.defaultSiteId;
  const site = await prisma.site.findFirst({ where: { companyId, isActive: true }, orderBy: { name: "asc" }, select: { id: true } });
  return site?.id ?? null;
}

/* ── Preview (GET /api/v2/retail/stock/counts/preview) ───────────────────── */

const ids = z.array(z.string().uuid());
const SCOPES = ["EVERYTHING", "CATEGORIES", "PRODUCTS", "PLACE"] as const;

export const countPreviewInput = z.object({
  siteId: z.string().uuid().optional(),
  scope: z.enum(SCOPES),
  categoryIds: ids.optional(),
  lineIds: ids.optional(),
  placeId: z.string().uuid().optional(),
});

/** How many products a count would cover: the sheet's "61 products." */
export async function previewCount(companyId: string, input: z.infer<typeof countPreviewInput>): Promise<{ products: number }> {
  const siteId = input.siteId ?? (await defaultSiteId(companyId));
  if (!siteId) return { products: 0 };
  const lines = await resolveCountLines(prisma, { companyId, siteId, ...input });
  return { products: lines.length };
}

/* ── Start (POST /api/v2/retail/stock/counts) ────────────────────────────── */

export const countStartInput = z.object({
  scope: z.enum(SCOPES, { message: "Say what to count." }),
  categoryIds: ids.optional(),
  lineIds: ids.optional(),
  placeId: z.string().uuid("Pick a place.").optional(),
  siteId: z.string().uuid("Pick one of this shop’s open sites.").optional(),
  counterId: z.string({ message: "Pick who counts." }).uuid("Pick who counts."),
  blind: z.boolean(),
  keepSelling: z.boolean(),
});

export type CountStartInput = z.infer<typeof countStartInput>;

/** The sheet's field each input key is drawn under. */
const FIELD_OF: Record<string, string> = {
  scope: "scope",
  categoryIds: "cats",
  lineIds: "lines",
  placeId: "place",
  siteId: "site",
  counterId: "who",
};

/** A body that did not parse, as the sheet's fields. */
export function countFieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = FIELD_OF[String(issue.path[0])] ?? String(issue.path[0] ?? "scope");
    if (!(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/** Where "Nothing to count there." is said: under the field that chose it. */
const SCOPE_FIELD: Record<CountScope, string> = { EVERYTHING: "scope", CATEGORIES: "cats", PRODUCTS: "lines", PLACE: "place" };

export type StartedCount = {
  id: string;
  countNo: string;
  lines: number;
  counter: { id: string; name: string };
  messaged: boolean;
};

type Told = { id: string; countNo: string; name: string; scope: CountScope; site: string };

/**
 * Tells the counter their count is waiting: in the app, and on WhatsApp
 * through the outbox when they have a phone. Answers whether a WhatsApp went.
 */
async function tellCounter(
  actor: CountActor,
  count: Told,
  counter: { id: string; name: string; phone: string | null },
  requestUrl: string | null,
): Promise<boolean> {
  const viewPath = `/retail/stock/counts/${count.id}/count`;
  await emitRetailNotification({
    companyId: actor.companyId,
    recipientIds: [counter.id],
    type: "RETAIL_COUNT_ASSIGNED",
    title: `${count.countNo} to count`,
    summary: `${actor.userName ?? "Someone"} asked you to count ${countPhrase(count.name, count.scope)} at ${count.site}.`,
    entityType: "RETAIL_STOCK_COUNT",
    entityId: count.id,
    viewPath,
  });
  if (!counter.phone) return false;
  const link = await approvalLink(actor.companyId, viewPath, requestUrl);
  await prisma.retailMessage.create({
    data: {
      companyId: actor.companyId,
      channel: "WHATSAPP",
      to: counter.phone,
      template: COUNT_LINK_TEMPLATE,
      body: countLinkText({ by: actor.userName ?? "The shop", name: count.name, scope: count.scope, site: count.site, link }),
      createdById: actor.userId,
    },
  });
  return true;
}

/**
 * Starts a count (W-22 step 1). One transaction, under the shop's count lock
 * so two counts cannot take the same lines: the count, a line per stock line
 * with on hand now as expected, and `RETAIL_STOCK_COUNT.STARTED`. Then the
 * counter is told, unless they started it themselves.
 */
export async function startCount(actor: CountActor, input: CountStartInput, requestUrl: string | null = null): Promise<StartedCount> {
  const { companyId } = actor;
  const siteId = input.siteId ?? (await defaultSiteId(companyId));
  const errors: Record<string, string> = {};
  const site = siteId
    ? await prisma.site.findFirst({ where: { id: siteId, companyId, isActive: true }, select: { id: true, name: true } })
    : null;
  if (!site) errors.site = "Pick one of this shop’s open sites.";
  const counter = await prisma.user.findFirst({
    where: { id: input.counterId, companyId, isActive: true },
    select: { id: true, name: true, phone: true },
  });
  if (!counter) errors.who = "Pick who counts.";
  if (input.scope === "CATEGORIES" && !input.categoryIds?.length) errors.cats = "Add a category.";
  if (input.scope === "PRODUCTS" && !input.lineIds?.length) errors.lines = "Add a product.";
  let place: { id: string; name: string } | null = null;
  if (input.scope === "PLACE") {
    place = input.placeId && site
      ? await prisma.stockLocation.findFirst({ where: { id: input.placeId, siteId: site.id, isActive: true }, select: { id: true, name: true } })
      : null;
    if (!place) errors.place = "Pick a place.";
  }
  if (Object.keys(errors).length > 0 || !site || !counter) {
    throw new CountRefusal(400, Object.values(errors)[0] ?? "Check the count.", errors);
  }

  const started = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`retail-stock-count:${companyId}`}))`;
    const lines = await resolveCountLines(tx, { companyId, siteId: site.id, ...input });
    if (lines.length === 0) {
      const field = SCOPE_FIELD[input.scope];
      throw new CountRefusal(400, "Nothing to count there.", { [field]: "Nothing to count there." });
    }
    const busy = await tx.retailStockCountLine.findMany({
      where: { companyId, inventoryItemId: { in: lines.map((line) => line.id) }, count: { status: { in: OPEN_STATUSES } } },
      select: { count: { select: { countNo: true } } },
      orderBy: { count: { countNo: "asc" } },
    });
    if (busy.length > 0) throw new CountRefusal(409, alreadyCountingWords(busy.length, busy[0]!.count.countNo));

    const categories =
      input.scope === "CATEGORIES"
        ? await tx.retailCategory.findMany({ where: { companyId, id: { in: input.categoryIds ?? [] } }, select: { id: true, name: true } })
        : [];
    const name = countName({
      scope: input.scope,
      categories: (input.categoryIds ?? []).flatMap((id) => categories.find((row) => row.id === id)?.name ?? []),
      place: place?.name ?? null,
      products: lines.map((line) => line.product),
    });
    const countNo = await reserveIdentifier(tx, { companyId, entity: "RETAIL_STOCK_COUNT" });
    const count = await tx.retailStockCount.create({
      data: {
        companyId,
        countNo,
        siteId: site.id,
        name,
        scope: input.scope,
        categoryIds: input.scope === "CATEGORIES" ? (input.categoryIds ?? []) : [],
        placeId: place?.id ?? null,
        blind: input.blind,
        keepSelling: input.keepSelling,
        counterId: counter.id,
        createdById: actor.userId,
        lines: {
          create: lines.map((line) => ({
            companyId,
            inventoryItemId: line.id,
            productId: line.productId,
            expected: line.onHand,
            unitCost: money(line.unitCost ?? 0),
            sortKey: sortKeyOf(line),
          })),
        },
      },
      select: { id: true },
    });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.countStarted,
      entityType: "RetailStockCount",
      entityId: count.id,
      payload: {
        countNo,
        lines: lines.length,
        counterId: counter.id,
        counter: counter.name,
        blind: input.blind,
        keepSelling: input.keepSelling,
      },
    });
    return { id: count.id, countNo, name, lines: lines.length };
  });

  const messaged =
    counter.id === actor.userId
      ? false
      : await tellCounter(actor, { ...started, scope: input.scope, site: site.name }, counter, requestUrl);
  return {
    id: started.id,
    countNo: started.countNo,
    lines: started.lines,
    counter: { id: counter.id, name: counter.name },
    messaged,
  };
}

/* ── One count: who may, and what it says ────────────────────────────────── */

type CountHead = {
  id: string;
  countNo: string;
  status: RetailStockCountStatus;
  counterId: string;
  blind: boolean;
};

/** The count, this shop's, or 404. */
async function headOf(companyId: string, id: string): Promise<CountHead> {
  const count = await prisma.retailStockCount.findFirst({
    where: { id, companyId },
    select: { id: true, countNo: true, status: true, counterId: true, blind: true },
  });
  if (!count) throw new CountRefusal(404, NOT_FOUND);
  return count;
}

/** Reading a count: anyone who may see counts, or its counter. */
function mayRead(actor: CountActor, grants: CountGrants, count: CountHead) {
  if (!grants.view && !grants.update && count.counterId !== actor.userId) throw new CountRefusal(403, NOT_YOURS);
}

/** Whether `expected` is kept from this reader: the counter of a blind count, while it is theirs to count. */
const hidesExpected = (actor: CountActor, grants: CountGrants, count: CountHead) =>
  count.blind && count.counterId === actor.userId && !grants.approve;

export type CountView = {
  id: string;
  countNo: string;
  name: string;
  status: CountStatus;
  scope: CountScope;
  scopeLabel: string;
  site: { id: string; name: string };
  /** Whether the shop has more than one open site: the phone names the site only then. */
  multiSite: boolean;
  place: { id: string; name: string } | null;
  blind: boolean;
  keepSelling: boolean;
  counter: { id: string; name: string; role: string };
  createdBy: { name: string };
  startedAt: string;
  firstCountedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  lines: number;
  counted: number;
  differ: number;
  recount: number;
  short?: { value: number; lines: number };
  over?: { value: number; lines: number };
  difference?: number;
  approves: "A manager" | "The owner";
  history: Array<{ id: string; countNo: string; at: string; difference: number }>;
  /** The reader is the counter: what the phone needs to know. */
  yours: boolean;
  /** Who approves it, as the phone says once it is sent: "Tafara Nyathi or the owner", "The owner". */
  approver: string;
};

const cents = (value: number) => Math.round(value * 100) / 100;

/** A count as its record and the phone read it (4.4 `CountView`); cost only for someone who may see it. */
export async function loadCountView(actor: CountActor, grants: CountGrants, id: string): Promise<CountView> {
  const head = await headOf(actor.companyId, id);
  mayRead(actor, grants, head);
  const [count, sites] = await Promise.all([
    prisma.retailStockCount.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        countNo: true,
        name: true,
        status: true,
        scope: true,
        blind: true,
        keepSelling: true,
        createdAt: true,
        firstCountedAt: true,
        submittedAt: true,
        approvedAt: true,
        site: { select: { id: true, name: true } },
        place: { select: { id: true, name: true } },
        counter: { select: { id: true, name: true, role: true } },
        createdBy: { select: { id: true, name: true, role: true } },
        approvedBy: { select: { name: true } },
        lines: { select: { counted: true, difference: true, unitCost: true, recount: true } },
      },
    }),
    prisma.site.count({ where: { companyId: actor.companyId, isActive: true } }),
  ]);
  const counted = count.lines.filter((line) => line.counted !== null);
  const differing = counted.filter((line) => line.difference && !line.difference.isZero());
  const value = (lines: typeof count.lines) =>
    cents(lines.reduce((sum, line) => sum + (line.difference?.toNumber() ?? 0) * line.unitCost.toNumber(), 0));
  const shortLines = differing.filter((line) => line.difference!.isNegative());
  const overLines = differing.filter((line) => !line.difference!.isNegative());
  const short = value(shortLines);
  const over = value(overLines);
  return {
    id: count.id,
    countNo: count.countNo,
    name: count.name,
    status: count.status,
    scope: count.scope,
    scopeLabel: count.name.replace(/ shelf$/, ""),
    site: count.site,
    multiSite: sites > 1,
    place: count.place,
    blind: count.blind,
    keepSelling: count.keepSelling,
    counter: { id: count.counter.id, name: count.counter.name, role: count.counter.role },
    createdBy: { name: count.createdBy.name },
    startedAt: count.createdAt.toISOString(),
    firstCountedAt: count.firstCountedAt?.toISOString() ?? null,
    submittedAt: count.submittedAt?.toISOString() ?? null,
    approvedAt: count.approvedAt?.toISOString() ?? null,
    approvedBy: count.approvedBy?.name ?? null,
    lines: count.lines.length,
    counted: counted.length,
    differ: differing.length,
    recount: count.lines.filter((line) => line.recount).length,
    ...(grants.seeCost
      ? {
          short: { value: short, lines: shortLines.length },
          over: { value: over, lines: overLines.length },
          difference: cents(short + over),
        }
      : {}),
    approves: "A manager",
    // STK-06 fills the chart and the review aside.
    history: [],
    yours: count.counter.id === actor.userId,
    approver: approverWords(count.createdBy, count.counter.id),
  };
}

/**
 * Who approves a count, in the phone's words: whoever started it, when they
 * may approve and are not the counter, "or the owner"; an owner's own count,
 * the owner; else a manager.
 */
function approverWords(startedBy: { id: string; name: string; role: string }, counterId: string): string {
  if (startedBy.role === "SUPERADMIN") return "The owner";
  if (startedBy.id !== counterId && canRetailRoleDo(startedBy.role, "retail.counts", "approve")) return `${startedBy.name} or the owner`;
  return "A manager or the owner";
}

/* ── Lines (GET …/lines, PUT …/lines/[lineId]) ───────────────────────────── */

export type CountLine = {
  id: string;
  productId: string | null;
  product: string;
  /** The shelf, else the place, else the category. */
  sub: string;
  barcode: string | null;
  /** On hand when the count started; absent for the counter of a blind count. */
  expected?: number;
  counted: string | null;
  countedAt: string | null;
  expectedAtCount?: number | null;
  difference?: number | null;
  unitCost?: number;
  why: string | null;
  recount: boolean;
};

export type CountProgress = { counted: number; total: number };

export const LINE_TABS = ["all", "differ", "match", "recount"] as const;
export type LineTab = (typeof LINE_TABS)[number];

const LINE_SELECT = {
  id: true,
  productId: true,
  expected: true,
  counted: true,
  countedAt: true,
  expectedAtCount: true,
  difference: true,
  unitCost: true,
  why: true,
  recount: true,
  inventoryItem: {
    select: {
      shelf: true,
      name: true,
      location: { select: { name: true } },
      product: { select: { name: true, barcode: true, retailCategory: { select: { name: true } } } },
    },
  },
} satisfies Prisma.RetailStockCountLineSelect;

type LineRow = Prisma.RetailStockCountLineGetPayload<{ select: typeof LINE_SELECT }>;

/** A figure as typed back: "7", "2.5". */
const figure = (value: Prisma.Decimal) => value.toNumber().toString();

function asCountLine(row: LineRow, showExpected: boolean, seeCost: boolean): CountLine {
  const item = row.inventoryItem;
  return {
    id: row.id,
    productId: row.productId,
    product: item.product?.name ?? item.name,
    sub: item.shelf?.trim() || item.location?.name || item.product?.retailCategory?.name || "",
    barcode: item.product?.barcode ?? null,
    ...(showExpected
      ? {
          expected: row.expected.toNumber(),
          expectedAtCount: row.expectedAtCount?.toNumber() ?? null,
          difference: row.difference?.toNumber() ?? null,
        }
      : {}),
    counted: row.counted ? figure(row.counted) : null,
    countedAt: row.countedAt?.toISOString() ?? null,
    ...(seeCost ? { unitCost: row.unitCost.toNumber() } : {}),
    why: row.why,
    recount: row.recount,
  };
}

async function progressOf(db: Prisma.TransactionClient | typeof prisma, countId: string): Promise<CountProgress> {
  const [total, counted] = await Promise.all([
    db.retailStockCountLine.count({ where: { countId } }),
    db.retailStockCountLine.count({ where: { countId, counted: { not: null } } }),
  ]);
  return { counted, total };
}

/**
 * A count's lines in the phone's order. The counter of a blind count never
 * sees what is expected; while lines wait to be counted again, the counter
 * gets only those.
 */
export async function loadCountLines(
  actor: CountActor,
  grants: CountGrants,
  id: string,
  tab: LineTab = "all",
): Promise<{ lines: CountLine[]; progress: CountProgress }> {
  const head = await headOf(actor.companyId, id);
  mayRead(actor, grants, head);
  const recountOnly =
    head.counterId === actor.userId && head.status === "COUNTING" &&
    (await prisma.retailStockCountLine.count({ where: { countId: id, recount: true } })) > 0;
  const where: Prisma.RetailStockCountLineWhereInput = { countId: id };
  if (recountOnly || tab === "recount") where.recount = true;
  else if (tab === "differ") where.difference = { not: 0 };
  else if (tab === "match") where.difference = 0;
  const rows = await prisma.retailStockCountLine.findMany({ where, orderBy: [{ sortKey: "asc" }, { id: "asc" }], select: LINE_SELECT });
  const showExpected = !hidesExpected(actor, grants, head);
  return {
    lines: rows.map((row) => asCountLine(row, showExpected, grants.seeCost && showExpected)),
    progress: await progressOf(prisma, id),
  };
}

/** A figure as typed: a number not below 0, at most four places. */
const COUNTED = /^\d+(\.\d{1,4})?$/;
export const countedInput = z.object({
  counted: z.string({ message: "Type how many are there." }).trim().regex(COUNTED, "Type how many are there."),
});

/**
 * Saves one figure (W-22 step 2): the counter's while counting (or anyone who
 * may change counts), an approver's while it waits for approval. Under the
 * stock line's lock, so `expectedAtCount` is on hand at this moment and no
 * sale lands between the read and the save; the difference is counted less
 * that. The count's first figure stamps `firstCountedAt`.
 */
export async function saveCountLine(
  actor: CountActor,
  grants: CountGrants,
  countId: string,
  lineId: string,
  counted: string,
): Promise<{ line: CountLine; progress: CountProgress }> {
  const head = await headOf(actor.companyId, countId);
  mayRead(actor, grants, head);
  if (head.status === "APPROVED" || head.status === "CANCELLED") throw new CountRefusal(409, CLOSED);
  if (head.status === "COUNTING" && head.counterId !== actor.userId && !grants.update) throw new CountRefusal(403, NOT_YOURS);
  if (head.status === "TO_APPROVE" && !grants.approve) throw new CountRefusal(409, "This count was sent for review.");

  const value = quantity(counted);
  return prisma.$transaction(async (tx) => {
    const line = await tx.retailStockCountLine.findFirst({ where: { id: lineId, countId }, select: { id: true, inventoryItemId: true, expectedAtCount: true } });
    if (!line) throw new CountRefusal(404, "That line is not on this count.");
    // Held until the save commits: a sale waits, and lands after the figure.
    const [stock] = await tx.$queryRaw<Array<{ currentStock: Prisma.Decimal }>>`
      SELECT "currentStock" FROM "InventoryItem" WHERE "id" = ${line.inventoryItemId} FOR UPDATE`;
    const status = await tx.retailStockCount.findUniqueOrThrow({ where: { id: countId }, select: { status: true, firstCountedAt: true } });
    if (status.status === "APPROVED" || status.status === "CANCELLED") throw new CountRefusal(409, CLOSED);
    // An approver's correction keeps what was on hand when it was counted.
    const atCount = status.status === "TO_APPROVE" && line.expectedAtCount ? line.expectedAtCount : quantity(stock!.currentStock);
    const now = new Date();
    const saved = await tx.retailStockCountLine.update({
      where: { id: line.id },
      data: {
        counted: value,
        countedAt: now,
        countedById: actor.userId,
        expectedAtCount: atCount,
        difference: value.minus(atCount),
        recount: false,
      },
      select: LINE_SELECT,
    });
    if (!status.firstCountedAt) await tx.retailStockCount.update({ where: { id: countId }, data: { firstCountedAt: now } });
    const showExpected = !hidesExpected(actor, grants, head);
    return { line: asCountLine(saved, showExpected, grants.seeCost && showExpected), progress: await progressOf(tx, countId) };
  });
}

/* ── Send for review (POST …/submit) ─────────────────────────────────────── */

/**
 * "Done, send for review" (W-22 step 2): every line counted, else 409 with
 * how many are left. To approve, `RETAIL_STOCK_COUNT.SUBMITTED`, and every
 * owner and every manager at the count's site is asked to approve it.
 */
export async function submitCount(
  actor: CountActor,
  grants: CountGrants,
  id: string,
  requestUrl: string | null = null,
): Promise<{ status: "TO_APPROVE" }> {
  const head = await headOf(actor.companyId, id);
  mayRead(actor, grants, head);
  if (head.counterId !== actor.userId && !grants.update) throw new CountRefusal(403, NOT_YOURS);
  if (head.status === "APPROVED" || head.status === "CANCELLED") throw new CountRefusal(409, CLOSED);
  if (head.status !== "COUNTING") throw new CountRefusal(409, "This count was already sent for review.");

  const sent = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RetailStockCount" WHERE "id" = ${id} FOR UPDATE`;
    const count = await tx.retailStockCount.findUniqueOrThrow({
      where: { id },
      select: { status: true, countNo: true, name: true, siteId: true, lines: { select: { counted: true, difference: true } } },
    });
    if (count.status !== "COUNTING") throw new CountRefusal(409, "This count was already sent for review.");
    const left = count.lines.filter((line) => line.counted === null).length;
    if (left > 0) throw new CountRefusal(409, toGoWords(left));
    const differ = count.lines.filter((line) => line.difference && !line.difference.isZero()).length;
    await tx.retailStockCount.update({ where: { id }, data: { status: "TO_APPROVE", submittedAt: new Date() } });
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.countSubmitted,
      entityType: "RetailStockCount",
      entityId: id,
      payload: { countNo: count.countNo, lines: count.lines.length, differ },
    });
    return { ...count, differ };
  });

  await notifyApprover({
    companyId: actor.companyId,
    level: "manager",
    siteId: sent.siteId,
    type: "RETAIL_COUNT_SUBMITTED",
    title: `${sent.countNo} is ready to approve`,
    summary: `${sent.name}: ${sent.lines.length} ${sent.lines.length === 1 ? "line" : "lines"} counted, ${sent.differ} ${sent.differ === 1 ? "differs" : "differ"}.`,
    entityType: "RETAIL_STOCK_COUNT",
    entityId: id,
    viewPath: `/retail/stock/counts/${id}/review`,
    severity: "INFO",
    askedById: actor.userId,
    requestUrl,
  });
  return { status: "TO_APPROVE" };
}

/* ── Remind (POST …/remind) ──────────────────────────────────────────────── */

/** Tells the counter again, while the count is being counted. */
export async function remindCounter(actor: CountActor, id: string, requestUrl: string | null = null): Promise<{ messaged: boolean }> {
  const count = await prisma.retailStockCount.findFirst({
    where: { id, companyId: actor.companyId },
    select: {
      id: true,
      countNo: true,
      name: true,
      scope: true,
      status: true,
      site: { select: { name: true } },
      counter: { select: { id: true, name: true, phone: true } },
    },
  });
  if (!count) throw new CountRefusal(404, NOT_FOUND);
  if (count.status !== "COUNTING") throw new CountRefusal(409, "This count is not being counted.");
  const messaged = await tellCounter(actor, { ...count, site: count.site.name }, count.counter, requestUrl);
  return { messaged };
}

/* ── The till (T lock) ───────────────────────────────────────────────────── */

/**
 * Refuses a sale of a product held back by a count that does not keep
 * selling (W-22 step 2): the first such line answers 409 "Castle Lager 340ml
 * is being counted. It sells again when the count is sent." Replays are not
 * asked: the money was already taken.
 */
export async function refuseWhileCounted(companyId: string, inventoryItemIds: string[]): Promise<void> {
  if (inventoryItemIds.length === 0) return;
  const held = await prisma.retailStockCountLine.findFirst({
    where: {
      companyId,
      inventoryItemId: { in: inventoryItemIds },
      count: { status: "COUNTING", keepSelling: false },
    },
    select: { inventoryItem: { select: { name: true, product: { select: { name: true } } } } },
  });
  if (held) throw new BeingCounted(held.inventoryItem.product?.name ?? held.inventoryItem.name);
}
