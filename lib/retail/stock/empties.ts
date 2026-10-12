import { Prisma, type RetailEmptiesKind } from "@prisma/client";
import { z } from "zod";

import { exceeds, money, multiplyMoney, sumMoney, toNumberOrZero, ZERO } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditAmount, auditCashMoved, RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { shopSiteId } from "@/lib/retail/devices";
import { formatMoney } from "@/lib/workspace/format";
import { postRetailJournal } from "@/app/api/v2/retail/_helpers";

/**
 * The Empties ledger (30-stock W-27, STK-09): every empty bottle and crate in
 * or out of the store, and the two deposit balances — held for customers and
 * owed by suppliers.
 *
 * Every entry is written under a per-site advisory lock, so `bottlesAfter` and
 * `cratesAfter` are the previous entry's plus this one's change: a true running
 * balance even when two tills write at once. Bottles and crates follow the
 * physical count (30-stock OQ 5): a sale moves no empties, empties brought back
 * add, empties sent to a supplier take off.
 *
 * Money: a sale's deposits already move 2240 through the sale's own posting,
 * so the sale hooks write the ledger only. Bottles back without a sale pays
 * cash out of the drawer and posts `RETAIL_BOTTLES_BACK` (deposits held
 * against till cash). Supplier returns and credits move no account
 * (30-stock OQ 6): the ledger is the record.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export const EMPTIES_OFF = "Empties and deposits is off for this shop.";

/** A refusal in the sheet's words, under the field it belongs to when it has one. */
export class EmptiesRefusal extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "EmptiesRefusal";
  }
}

export type EmptiesActor = RetailAuditActor & { userName: string | null };

/** The deposits behind a held balance, and those behind an owed one. */
export const HELD_KINDS: RetailEmptiesKind[] = ["DEPOSIT_CHARGED", "DEPOSIT_REFUNDED", "BOTTLES_BACK"];
export const OWED_KINDS: RetailEmptiesKind[] = ["RETURNED_TO_SUPPLIER", "CREDIT_RECEIVED"];

/** The shop's switch and its deposits; refuses 409 unless it is a liquor store taking deposits. */
export async function emptiesShop(db: Db, companyId: string) {
  const profile = await db.retailShopProfile.findUnique({
    where: { companyId },
    select: { businessType: true, emptiesAndDeposits: true, bottleDeposit: true, crateDeposit: true },
  });
  if (!profile || profile.businessType !== "LIQUOR" || !profile.emptiesAndDeposits) throw new EmptiesRefusal(409, EMPTIES_OFF);
  return { bottleDeposit: money(profile.bottleDeposit), crateDeposit: money(profile.crateDeposit) };
}

/** Empties in the store at a site now: the latest entry's afters. */
export async function inStore(db: Db, siteId: string): Promise<{ bottles: number; crates: number }> {
  const last = await db.retailEmptiesEntry.findFirst({
    where: { siteId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { bottlesAfter: true, cratesAfter: true },
  });
  return { bottles: last?.bottlesAfter ?? 0, crates: last?.cratesAfter ?? 0 };
}

/** Holds the site's empties until the transaction ends: the next entry's afters read what this one wrote. */
async function lockSite(tx: Tx, siteId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`empties:${siteId}`}))`;
}

type EntryInput = {
  companyId: string;
  siteId: string;
  kind: RetailEmptiesKind;
  bottles?: number;
  crates?: number;
  deposit: Prisma.Decimal;
  saleId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  goodsReceiptId?: string | null;
  returnId?: string | null;
  reference?: string | null;
  note?: string | null;
  createdById?: string | null;
  /** The seed's history only: when it happened. Live entries are stamped now. */
  at?: Date;
};

/** One entry, its afters the site's running balance. The caller holds the site's lock. */
async function writeEntry(tx: Tx, input: EntryInput) {
  // The store's figure is the latest entry's: one stamped later than now would hide every write before it.
  if (input.at && input.at.getTime() > Date.now()) throw new Error("An empties entry cannot be dated after now.");
  const now = await inStore(tx, input.siteId);
  const bottles = input.bottles ?? 0;
  const crates = input.crates ?? 0;
  return tx.retailEmptiesEntry.create({
    data: {
      companyId: input.companyId,
      siteId: input.siteId,
      kind: input.kind,
      bottles,
      crates,
      deposit: input.deposit,
      bottlesAfter: now.bottles + bottles,
      cratesAfter: now.crates + crates,
      saleId: input.saleId ?? null,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      supplierName: input.supplierName ?? null,
      goodsReceiptId: input.goodsReceiptId ?? null,
      returnId: input.returnId ?? null,
      reference: input.reference ?? null,
      note: input.note ?? null,
      createdById: input.createdById ?? null,
      ...(input.at ? { createdAt: input.at } : {}),
    },
  });
}

/**
 * One entry written as it stands, under the site's lock: the seed's history
 * (customers' empties brought back before the till took them, a ledger
 * brought forward). Live writes go through the functions below.
 */
export async function recordEmptiesEntry(tx: Tx, input: EntryInput) {
  await lockSite(tx, input.siteId);
  return writeEntry(tx, input);
}

/* ── The sale hooks ──────────────────────────────────────────────────────── */

/**
 * A sale's empties, in its transaction (`createRetailSaleTransaction`): the
 * deposit it charged on the bottles it sold, and the empties the customer
 * swapped back against those lines. The charge is the gross deposit, so the
 * charge less the bottles back is the sale's own `depositAmount` — what its
 * posting moves on 2240.
 */
export async function recordSaleEmpties(
  tx: Tx,
  sale: {
    companyId: string;
    siteId: string;
    saleId: string;
    saleNo: string;
    customerId?: string | null;
    createdById?: string | null;
    /** The sale's deposit, net of empties back. */
    depositAmount: Prisma.Decimal.Value;
    lines: ReadonlyArray<{ productId?: string | null; emptiesBack?: number }>;
    at?: Date;
  },
): Promise<void> {
  const back = sale.lines.filter(
    (line): line is { productId: string; emptiesBack: number } => Boolean(line.productId) && (line.emptiesBack ?? 0) > 0,
  );
  let bottlesBack = 0;
  let backDeposit = ZERO;
  if (back.length > 0) {
    const products = await tx.product.findMany({
      where: { companyId: sale.companyId, id: { in: [...new Set(back.map((line) => line.productId))] } },
      select: { id: true, depositAmount: true },
    });
    const each = new Map(products.map((product) => [product.id, money(product.depositAmount ?? 0)]));
    for (const line of back) {
      bottlesBack += line.emptiesBack;
      backDeposit = backDeposit.plus(multiplyMoney(line.emptiesBack, each.get(line.productId) ?? ZERO));
    }
  }
  const net = money(sale.depositAmount);
  const charged = net.plus(backDeposit);
  if (!charged.greaterThan(0) && bottlesBack === 0) return;

  await lockSite(tx, sale.siteId);
  const common = {
    companyId: sale.companyId,
    siteId: sale.siteId,
    saleId: sale.saleId,
    customerId: sale.customerId ?? null,
    reference: sale.saleNo,
    createdById: sale.createdById ?? null,
    at: sale.at,
  };
  if (charged.greaterThan(0)) await writeEntry(tx, { ...common, kind: "DEPOSIT_CHARGED", deposit: charged });
  if (bottlesBack > 0) await writeEntry(tx, { ...common, kind: "BOTTLES_BACK", bottles: bottlesBack, deposit: backDeposit.negated() });
}

/**
 * The deposit a refund or a void hands back (`refundRetailSaleTransaction`,
 * `voidRetailSaleTransaction`): one DEPOSIT_REFUNDED entry, on the refund's
 * own number. The empties stay where they are: a refund hands back money,
 * and bottles brought back stay in the store.
 */
export async function recordRefundEmpties(
  tx: Tx,
  refund: {
    companyId: string;
    siteId: string;
    saleId: string;
    saleNo: string;
    customerId?: string | null;
    createdById?: string | null;
    /** The deposit handed back, either sign. */
    depositAmount: Prisma.Decimal.Value;
  },
): Promise<void> {
  const back = money(refund.depositAmount).abs();
  if (!back.greaterThan(0)) return;
  await lockSite(tx, refund.siteId);
  await writeEntry(tx, {
    companyId: refund.companyId,
    siteId: refund.siteId,
    kind: "DEPOSIT_REFUNDED",
    deposit: back.negated(),
    saleId: refund.saleId,
    customerId: refund.customerId ?? null,
    reference: refund.saleNo,
    createdById: refund.createdById ?? null,
  });
}

/** Bottles a sale took back: what the Paid screen and the till's sale view say ("12 bottles"). */
export async function saleBottlesBack(db: Db, companyId: string, saleId: string): Promise<number> {
  const sum = await db.retailEmptiesEntry.aggregate({
    where: { companyId, saleId, kind: "BOTTLES_BACK" },
    _sum: { bottles: true },
  });
  return sum._sum.bottles ?? 0;
}

/* ── Returns and credits ─────────────────────────────────────────────────── */

/** "Delta" of "Delta Beverages": the supplier as a toast says them. */
export function shortName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** The site an empties write lands on: the one asked for (in the company, open), else the shop's own. */
async function emptiesSite(db: Db, companyId: string, siteId?: string | null) {
  const id = siteId ?? (await shopSiteId(companyId));
  const site = id ? await db.site.findFirst({ where: { id, companyId, isActive: true }, select: { id: true, name: true } }) : null;
  if (!site) throw new EmptiesRefusal(404, "Site not found");
  return site;
}

/**
 * Empties sent back to a supplier for their deposit (W-27 step 3): the
 * Return sheet, and Receive's "Empties going back" (BUY-06, with the
 * delivery and its GRN as the reference). Called in the caller's transaction.
 */
export async function bookEmptiesReturn(
  tx: Tx,
  input: {
    actor: EmptiesActor;
    siteId?: string | null;
    supplierId: string;
    bottles: number;
    crates: number;
    goodsReceiptId?: string | null;
    reference?: string | null;
    note?: string | null;
    at?: Date;
  },
): Promise<{ id: string; deposit: Prisma.Decimal; supplierName: string }> {
  const { actor } = input;
  const deposits = await emptiesShop(tx, actor.companyId);
  if (input.bottles <= 0 && input.crates <= 0) {
    throw new EmptiesRefusal(400, "Say how many bottles or crates.", { bottles: "Say how many bottles or crates." });
  }
  const supplier = await tx.vendor.findFirst({ where: { id: input.supplierId, companyId: actor.companyId }, select: { id: true, name: true } });
  if (!supplier) throw new EmptiesRefusal(400, "Pick the supplier.", { supplier: "Pick the supplier." });
  const site = await emptiesSite(tx, actor.companyId, input.siteId);

  await lockSite(tx, site.id);
  const now = await inStore(tx, site.id);
  const fieldErrors: Record<string, string> = {};
  if (input.bottles > now.bottles) fieldErrors.bottles = `Only ${now.bottles} ${now.bottles === 1 ? "bottle" : "bottles"} in the store.`;
  if (input.crates > now.crates) fieldErrors.crates = `Only ${now.crates} ${now.crates === 1 ? "crate" : "crates"} in the store.`;
  if (Object.keys(fieldErrors).length > 0) throw new EmptiesRefusal(400, Object.values(fieldErrors)[0]!, fieldErrors);

  const deposit = sumMoney([multiplyMoney(input.bottles, deposits.bottleDeposit), multiplyMoney(input.crates, deposits.crateDeposit)]);
  const entry = await writeEntry(tx, {
    companyId: actor.companyId,
    siteId: site.id,
    kind: "RETURNED_TO_SUPPLIER",
    bottles: -input.bottles,
    crates: -input.crates,
    deposit,
    supplierId: supplier.id,
    supplierName: supplier.name,
    goodsReceiptId: input.goodsReceiptId ?? null,
    reference: input.reference ?? null,
    note: input.note?.trim() || null,
    createdById: actor.userId,
    at: input.at,
  });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.emptiesReturned,
    entityType: "RetailEmptiesEntry",
    entityId: entry.id,
    payload: { supplier: supplier.name, bottles: input.bottles, crates: input.crates, deposit: auditAmount(deposit) },
  });
  return { id: entry.id, deposit, supplierName: supplier.name };
}

/** A return's supplier, and what they still owe on it (its deposit less its credits). */
export async function emptiesReturn(db: Db, companyId: string, returnId: string) {
  const entry = await db.retailEmptiesEntry.findFirst({
    where: { id: returnId, companyId, kind: "RETURNED_TO_SUPPLIER" },
    select: {
      id: true,
      siteId: true,
      deposit: true,
      supplierId: true,
      supplierName: true,
      reference: true,
      note: true,
      supplier: { select: { name: true } },
      credits: { select: { deposit: true } },
    },
  });
  if (!entry) return null;
  const owed = sumMoney([entry.deposit, ...entry.credits.map((credit) => credit.deposit)]);
  return {
    id: entry.id,
    siteId: entry.siteId,
    supplierId: entry.supplierId,
    supplier: entry.supplier?.name ?? entry.supplierName ?? "The supplier",
    owed,
    reference: entry.reference ?? entry.note,
  };
}

/** The supplier's credit note against a return (W-27 step 4): what they owe on it falls by the amount. */
export async function recordEmptiesCredit(
  tx: Tx,
  input: { actor: EmptiesActor; returnId: string; creditNote: string; amount: Prisma.Decimal.Value; note?: string | null; at?: Date },
): Promise<{ id: string; supplier: string; amount: Prisma.Decimal }> {
  const { actor } = input;
  await emptiesShop(tx, actor.companyId);
  const site = await tx.retailEmptiesEntry.findFirst({ where: { id: input.returnId, companyId: actor.companyId }, select: { siteId: true } });
  if (!site) throw new EmptiesRefusal(404, "Return not found");
  await lockSite(tx, site.siteId);
  const found = await emptiesReturn(tx, actor.companyId, input.returnId);
  if (!found) throw new EmptiesRefusal(404, "Return not found");

  const amount = money(input.amount);
  if (!amount.greaterThan(0) || exceeds(amount, found.owed)) {
    const words = `${found.supplier} owes ${formatMoney(toNumberOrZero(found.owed))} on this return.`;
    throw new EmptiesRefusal(400, words, { amount: words });
  }
  const entry = await writeEntry(tx, {
    companyId: actor.companyId,
    siteId: found.siteId,
    kind: "CREDIT_RECEIVED",
    deposit: amount.negated(),
    supplierId: found.supplierId,
    supplierName: found.supplier,
    returnId: found.id,
    reference: input.creditNote.trim(),
    note: input.note?.trim() || null,
    createdById: actor.userId,
    at: input.at,
  });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.emptiesCredited,
    entityType: "RetailEmptiesEntry",
    entityId: found.id,
    payload: { creditNote: input.creditNote.trim(), amount: auditAmount(amount), supplier: found.supplier },
  });
  return { id: entry.id, supplier: found.supplier, amount };
}

/* ── Bottles back at the till ────────────────────────────────────────────── */

/**
 * Empties a customer brings back without buying (W-27 step 2): their deposit
 * paid out of the caller's own open drawer. In one transaction the ledger
 * gains the bottles and crates (deposit −paid), the shift gains a PAYOUT
 * "Bottles back" of the same money and its expected cash falls by it. After
 * commit the payout posts Dr deposits held / Cr till cash, so the drawer, 1000
 * and 2240 all move by the same cents.
 */
export async function payBottlesBack(input: {
  actor: EmptiesActor;
  shiftId: string;
  bottles: number;
  crates: number;
  customerId?: string | null;
  at?: Date;
}): Promise<{ paid: Prisma.Decimal; entryId: string; movementId: string }> {
  const { actor } = input;
  if (input.bottles <= 0 && input.crates <= 0) {
    throw new EmptiesRefusal(400, "Say how many bottles or crates.", { bottles: "Say how many bottles or crates." });
  }
  const done = await prisma.$transaction(async (tx) => {
    const deposits = await emptiesShop(tx, actor.companyId);
    const [shift] = await tx.$queryRaw<Array<{ id: string; status: string; cashierId: string; siteId: string; registerCode: string | null; shiftNo: string; expectedCash: Prisma.Decimal }>>`
      SELECT "id", "status", "cashierId", "siteId", "registerCode", "shiftNo", "expectedCash"
      FROM "RetailShift" WHERE "id" = ${input.shiftId} AND "companyId" = ${actor.companyId} FOR UPDATE`;
    if (!shift || shift.status !== "OPEN" || shift.cashierId !== actor.userId) throw new EmptiesRefusal(409, "Open a shift to pay out.");
    if (input.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, companyId: actor.companyId }, select: { id: true } });
      if (!customer) throw new EmptiesRefusal(400, "Pick the customer.", { customer: "Pick the customer." });
    }
    const paid = sumMoney([multiplyMoney(input.bottles, deposits.bottleDeposit), multiplyMoney(input.crates, deposits.crateDeposit)]);
    if (exceeds(paid, shift.expectedCash)) {
      throw new EmptiesRefusal(400, `Only ${formatMoney(toNumberOrZero(shift.expectedCash))} should be in the drawer.`);
    }
    const name = actor.userName ?? "Someone";
    const movement = await tx.retailCashMovement.create({
      data: {
        companyId: actor.companyId,
        shiftId: shift.id,
        type: "PAYOUT",
        reasonCode: "BOTTLES_BACK",
        amount: paid,
        currency: "USD",
        exchangeRate: 1,
        baseAmount: paid,
        reason: "Bottles back",
        recordedById: actor.userId,
        recordedByName: name,
        approvedById: actor.userId,
        approvedByName: name,
        ...(input.at ? { createdAt: input.at } : {}),
      },
    });
    const updated = await tx.retailShift.updateMany({
      where: { id: shift.id, status: "OPEN" },
      data: { expectedCash: { decrement: paid } },
    });
    if (updated.count !== 1) throw new EmptiesRefusal(409, "Open a shift to pay out.");
    await lockSite(tx, shift.siteId);
    const entry = await writeEntry(tx, {
      companyId: actor.companyId,
      siteId: shift.siteId,
      kind: "BOTTLES_BACK",
      bottles: input.bottles,
      crates: input.crates,
      deposit: paid.negated(),
      customerId: input.customerId ?? null,
      reference: shift.shiftNo,
      createdById: actor.userId,
      at: input.at,
    });
    await auditCashMoved(tx, {
      actor,
      movementId: movement.id,
      shiftId: shift.id,
      type: movement.type,
      reasonCode: movement.reasonCode,
      amount: movement.amount,
      currency: movement.currency,
      baseAmount: movement.baseAmount,
      note: "Bottles back",
    });
    return { paid, entryId: entry.id, movement, shift };
  });

  const paid = toNumberOrZero(done.paid);
  await postRetailJournal({
    companyId: actor.companyId,
    sourceType: "RETAIL_BOTTLES_BACK",
    sourceId: done.movement.id,
    siteId: done.shift.siteId,
    registerCode: done.shift.registerCode,
    entryDate: done.movement.createdAt,
    description: `Bottles back ${done.shift.shiftNo}`,
    createdById: actor.userId,
    actorRole: actor.userRole ?? undefined,
    amount: paid,
    netAmount: paid,
    taxAmount: 0,
    grossAmount: paid,
  });
  return { paid: done.paid, entryId: done.entryId, movementId: done.movement.id };
}

/* ── Reading ─────────────────────────────────────────────────────────────── */

/** The two deposit balances over the whole shop: Σ deposit of each group of kinds. */
export async function emptiesBalances(db: Db, companyId: string): Promise<{ held: Prisma.Decimal; owed: Prisma.Decimal }> {
  const sums = await db.retailEmptiesEntry.groupBy({ by: ["kind"], where: { companyId }, _sum: { deposit: true } });
  const of = (kinds: RetailEmptiesKind[]) => sumMoney(sums.filter((row) => kinds.includes(row.kind)).map((row) => row._sum.deposit ?? 0));
  return { held: of(HELD_KINDS), owed: of(OWED_KINDS) };
}

/** `GET /empties/summary`: the Return sheet's sub and deposits, and the two balances. */
export async function emptiesSummary(companyId: string, siteId?: string | null) {
  const deposits = await emptiesShop(prisma, companyId);
  const site = await emptiesSite(prisma, companyId, siteId);
  const [store, balances] = await Promise.all([inStore(prisma, site.id), emptiesBalances(prisma, companyId)]);
  return {
    site,
    inStore: store,
    heldForCustomers: balances.held.toFixed(2),
    owedBySuppliers: balances.owed.toFixed(2),
    bottleDeposit: deposits.bottleDeposit.toFixed(2),
    crateDeposit: deposits.crateDeposit.toFixed(2),
  };
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */

const count = (field: string) =>
  z.coerce
    .number({ message: `Say how many ${field}.` })
    .int({ message: `Whole ${field} only.` })
    .min(0, { message: `Whole ${field} only.` })
    .max(1_000_000, { message: `Whole ${field} only.` });

export const returnInput = z.object({
  supplierId: z.string({ message: "Pick the supplier." }).uuid({ message: "Pick the supplier." }),
  bottles: count("bottles"),
  crates: count("crates"),
  goingBackWith: z.string({ message: "Say what they go back with." }).trim().min(1, { message: "Say what they go back with." }).max(80, { message: "Keep it to 80 characters." }),
  siteId: z.string().uuid().optional(),
});

export const creditInput = z.object({
  creditNote: z.string({ message: "Give their credit note number." }).trim().min(1, { message: "Give their credit note number." }).max(40, { message: "Keep it to 40 characters." }),
  amount: z.string({ message: "Give the amount, like 84.00." }).trim().regex(/^\d{1,9}(\.\d{1,2})?$/, { message: "Give the amount, like 84.00." }),
  note: z.string().trim().max(500, { message: "Keep it to 500 characters." }).optional(),
});

export const bottlesBackInput = z.object({
  shiftId: z.string().uuid({ message: "Open a shift to pay out." }),
  bottles: count("bottles"),
  crates: count("crates"),
  customerId: z.string().uuid().optional(),
});

const FIELD: Record<string, string> = { supplierId: "supplier", goingBackWith: "goingBackWith" };

/** A parse failure as the sheet's field errors (`supplier`, `bottles`, `crates`, `goingBackWith`, `creditNote`, `amount`). */
export function emptiesFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    const field = FIELD[key] ?? key;
    out[field] ??= issue.message;
  }
  return out;
}
