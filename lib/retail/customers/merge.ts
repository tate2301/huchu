import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { phoneDisplay } from "@/lib/retail/people/words";

import { CustomerRefusal } from "./create";
import { nameAndPhone, pointsAndVisits } from "./merge-words";
import { normalizePhone } from "./phone";
import { YEAR_MS } from "./stats";

/**
 * Merging a duplicate customer (CUS-05, W-45) and undoing it from the bin
 * (W-63). Nothing is copied or deleted: the duplicate's sales, lay-bys,
 * vouchers, notes and points entries are re-pointed at the survivor, the
 * survivor takes what it had no value for, and the duplicate goes to the bin
 * marked `mergedIntoId`. One `RetailCustomerMerge` row lists every id that
 * moved, so a restore moves back exactly those.
 *
 * Both customers' rows are locked `FOR UPDATE`, the lower id first, so two
 * merges (or a merge and a sale spending points) touching the same customer
 * wait for each other instead of deadlocking.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | typeof prisma;

export const PICK_ANOTHER = "Pick a different customer.";
export const KEEP_ONE = "Keep one of their two numbers.";

export const mergeInput = z.object({
  duplicateId: z.string({ message: PICK_ANOTHER }).uuid(PICK_ANOTHER),
  keepPhone: z.string().default(""),
});
export type MergeInput = z.input<typeof mergeInput>;

/** "Tapiwa Marange has spent points that came from T. Marange. Take them away first." */
export const spentSentence = (survivor: string, duplicate: string) =>
  `${survivor} has spent points that came from ${duplicate}. Take them away first.`;

/** The fields a merge fills on the survivor when it has none. */
const FILLABLE = ["email", "area", "dateOfBirth", "whatsapp"] as const;
type Fillable = (typeof FILLABLE)[number];

const SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  area: true,
  dateOfBirth: true,
  whatsapp: true,
  archivedAt: true,
  mergedIntoId: true,
} as const;

type Party = Prisma.CustomerGetPayload<{ select: typeof SELECT }>;

/** The customer's points: Σ of their ledger. */
async function pointsOf(db: Db, customerId: string): Promise<number> {
  const sum = await db.retailPointsEntry.aggregate({ where: { customerId }, _sum: { points: true } });
  return sum._sum.points ?? 0;
}

/** Visits in 12 months (CUS-02's definition): their not-voided SALE documents in [now − 365 days, now]. */
async function visitsOf(db: Db, customerId: string, now: Date): Promise<number> {
  return db.retailSale.count({
    where: {
      customerId,
      saleType: "SALE",
      status: { not: "VOIDED" },
      postedAt: { gte: new Date(now.getTime() - YEAR_MS), lte: now },
    },
  });
}

/**
 * Why the two cannot be merged here, in the record's words: the duplicate has
 * Accounting's documents (an invoice, a quotation or a CRM client). Packet 66
 * adds the account rule.
 */
export async function mergeBlockers(db: Db, _survivor: { id: string; name: string }, duplicate: { id: string; name: string }): Promise<string[]> {
  const [invoices, quotations, clients] = await Promise.all([
    db.salesInvoice.count({ where: { customerId: duplicate.id } }),
    db.salesQuotation.count({ where: { customerId: duplicate.id } }),
    db.crmClient.count({ where: { customerId: duplicate.id } }),
  ]);
  return invoices + quotations + clients > 0 ? [`${duplicate.name} has invoices in Accounting. Merge them there.`] : [];
}

/** Both live customers of the company, or 400 "Pick a different customer." (itself, another shop's, binned or merged). */
async function liveParties(db: Db, companyId: string, id: string, duplicateId: string): Promise<{ survivor: Party; duplicate: Party }> {
  const refuse = () => new CustomerRefusal(PICK_ANOTHER, 400, { other: PICK_ANOTHER });
  if (id === duplicateId) throw refuse();
  const rows = await db.customer.findMany({ where: { companyId, id: { in: [id, duplicateId] } }, select: SELECT });
  const survivor = rows.find((row) => row.id === id);
  const duplicate = rows.find((row) => row.id === duplicateId);
  if (!survivor) throw new CustomerRefusal("Customer not found", 404, {});
  if (survivor.archivedAt || survivor.mergedIntoId) throw new CustomerRefusal("Restore it to change it", 409, {});
  if (!duplicate || duplicate.archivedAt || duplicate.mergedIntoId) throw refuse();
  return { survivor, duplicate };
}

export type MergePreview = {
  points: number;
  visits: number;
  /** "3,433 points, 150 visits, one ledger". */
  text: string;
  /** The survivor's number then the duplicate's, as shown ("+263 77 412 3388"); blank for one with none. */
  phones: [string, string];
  blockers: string[];
};

/** What merging `duplicateId` into `id` would come to: `GET …/merge-preview?duplicateId=`. */
export async function mergePreview(companyId: string, id: string, duplicateId: string, now: Date = new Date()): Promise<MergePreview> {
  const { survivor, duplicate } = await liveParties(prisma, companyId, id, duplicateId);
  const [points, visits, blockers] = await Promise.all([
    Promise.all([pointsOf(prisma, survivor.id), pointsOf(prisma, duplicate.id)]),
    Promise.all([visitsOf(prisma, survivor.id, now), visitsOf(prisma, duplicate.id, now)]),
    mergeBlockers(prisma, survivor, duplicate),
  ]);
  const total = points[0] + points[1];
  const seen = visits[0] + visits[1];
  return {
    points: total,
    visits: seen,
    text: `${pointsAndVisits(total, seen)}, one ledger`,
    phones: [phoneDisplay(survivor.phone), phoneDisplay(duplicate.phone)],
    blockers,
  };
}

/** Holds both customers' rows, the lower id first. */
async function lockPair(tx: Tx, a: string, b: string): Promise<void> {
  for (const id of [a, b].sort()) {
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${id} FOR UPDATE`;
  }
}

/** One add or change of these numbers at a time (`createCustomer` takes the same lock). */
async function lockPhones(tx: Tx, companyId: string, phones: Array<string | null>): Promise<void> {
  for (const phone of [...new Set(phones.filter((value): value is string => Boolean(value)))].sort()) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retail-customer:${companyId}:${phone}`}))::text`;
  }
}

/** The number to keep: one of the two, written +263. Blank when neither has one. */
function keptPhone(raw: string, survivor: Party, duplicate: Party): string | null {
  const phones = [survivor.phone, duplicate.phone].filter((phone): phone is string => Boolean(phone));
  if (phones.length === 0) return null;
  let phone: string | null;
  try {
    phone = normalizePhone(raw);
  } catch {
    phone = null;
  }
  if (!phone || !phones.includes(phone)) throw new CustomerRefusal(KEEP_ONE, 400, { keep: KEEP_ONE });
  return phone;
}

export type Merged = { id: string; points: number; visits: number };

/**
 * Merge `duplicateId` into `id` in the caller's transaction. Refuses 400 for
 * itself, a binned or merged customer, or a number neither has; 409 with a
 * blocker's sentence. `points` and `visits` are the survivor's after.
 */
export async function mergeCustomers(
  tx: Tx,
  actor: RetailAuditActor,
  id: string,
  raw: unknown,
  now: Date = new Date(),
): Promise<Merged> {
  const parsed = mergeInput.safeParse(raw ?? {});
  if (!parsed.success) throw new CustomerRefusal(PICK_ANOTHER, 400, { other: PICK_ANOTHER });
  const { duplicateId } = parsed.data;
  if (duplicateId === id) throw new CustomerRefusal(PICK_ANOTHER, 400, { other: PICK_ANOTHER });

  await lockPair(tx, id, duplicateId);
  const { survivor, duplicate } = await liveParties(tx, actor.companyId, id, duplicateId);
  const keep = keptPhone(parsed.data.keepPhone, survivor, duplicate);
  const [blocker] = await mergeBlockers(tx, survivor, duplicate);
  if (blocker) throw new CustomerRefusal(blocker, 409, {});

  // A duplicate restored once and merged again: its undone row becomes this merge.
  const before = await tx.retailCustomerMerge.findUnique({ where: { duplicateId: duplicate.id }, select: { undoneAt: true } });
  if (before && !before.undoneAt) throw new CustomerRefusal(PICK_ANOTHER, 400, { other: PICK_ANOTHER });

  const [points, visits] = await Promise.all([pointsOf(tx, duplicate.id), visitsOf(tx, duplicate.id, now)]);
  const [sales, laybys, vouchers, notes] = await Promise.all([
    tx.retailSale.findMany({ where: { customerId: duplicate.id }, select: { id: true } }),
    tx.retailLayby.findMany({ where: { customerId: duplicate.id }, select: { id: true } }),
    tx.retailVoucher.findMany({ where: { customerId: duplicate.id }, select: { id: true } }),
    tx.retailCustomerNote.findMany({ where: { customerId: duplicate.id }, select: { id: true } }),
  ]);
  const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

  await tx.retailSale.updateMany({ where: { customerId: duplicate.id }, data: { customerId: survivor.id } });
  await tx.retailLayby.updateMany({ where: { customerId: duplicate.id }, data: { customerId: survivor.id } });
  await tx.retailVoucher.updateMany({ where: { customerId: duplicate.id }, data: { customerId: survivor.id } });
  await tx.retailCustomerNote.updateMany({ where: { customerId: duplicate.id }, data: { customerId: survivor.id } });
  // Points keep where they first came from: an entry the duplicate took in by an earlier merge stays marked with that one.
  await tx.retailPointsEntry.updateMany({ where: { customerId: duplicate.id, mergedFromId: null }, data: { mergedFromId: duplicate.id } });
  await tx.retailPointsEntry.updateMany({ where: { customerId: duplicate.id }, data: { customerId: survivor.id } });

  const filled: Fillable[] = FILLABLE.filter((field) => survivor[field] === null && duplicate[field] !== null);
  const replacing = keep !== null && keep !== survivor.phone;
  // The duplicate leaves the live list first, so its number is free for the survivor.
  await tx.customer.update({
    where: { id: duplicate.id },
    data: { mergedIntoId: survivor.id, archivedAt: now, isActive: false },
  });
  await tx.customer.update({
    where: { id: survivor.id },
    data: {
      ...Object.fromEntries(filled.map((field) => [field, duplicate[field]])),
      ...(replacing ? { phone: keep } : {}),
    },
  });

  const row = {
    companyId: actor.companyId,
    survivorId: survivor.id,
    survivorPhoneBefore: replacing ? survivor.phone : null,
    filledFields: filled,
    saleIds: ids(sales),
    laybyIds: ids(laybys),
    voucherIds: ids(vouchers),
    noteIds: ids(notes),
    accountMoved: false,
    points,
    visits,
    mergedById: actor.userId,
    createdAt: now,
    undoneAt: null,
    undoneById: null,
  };
  if (before) await tx.retailCustomerMerge.update({ where: { duplicateId: duplicate.id }, data: row });
  else await tx.retailCustomerMerge.create({ data: { ...row, duplicateId: duplicate.id } });

  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.customerMerged,
    entityType: "Customer",
    entityId: survivor.id,
    payload: {
      duplicate: { id: duplicate.id, name: duplicate.name, phone: duplicate.phone },
      keptPhone: keep,
      points,
      visits,
    },
  });
  await writeRetailAuditEvent(tx, {
    actor,
    eventType: RETAIL_AUDIT_EVENTS.recordBinned,
    entityType: "Customer",
    entityId: duplicate.id,
    payload: { kind: "customer", name: nameAndPhone(duplicate), merged: true },
  });

  const [after, seen] = await Promise.all([pointsOf(tx, survivor.id), visitsOf(tx, survivor.id, now)]);
  return { id: survivor.id, points: after, visits: seen };
}

/** The duplicate and every customer merged into it and not taken back out, all the way down. */
async function mergedChain(tx: Tx, duplicateId: string): Promise<string[]> {
  const chain = [duplicateId];
  for (let index = 0; index < chain.length; index += 1) {
    const rows = await tx.retailCustomerMerge.findMany({
      where: { survivorId: chain[index], undoneAt: null },
      select: { duplicateId: true },
    });
    for (const row of rows) if (!chain.includes(row.duplicateId)) chain.push(row.duplicateId);
  }
  return chain;
}

/**
 * Take a merged duplicate back out (the bin's restore of a customer with
 * `mergedIntoId`), in the caller's transaction: what the merge row lists and
 * still points at the survivor goes back, and the points entries that came
 * from the duplicate; the survivor's replaced number and the fields the merge
 * filled go back to what they were, unless changed since. Throws
 * `CustomerRefusal` 409 when the survivor has spent those points, is itself
 * merged away, or a live customer has taken one of the two numbers.
 */
export async function unmergeCustomer(
  tx: Tx,
  actor: RetailAuditActor,
  duplicateId: string,
  now: Date = new Date(),
): Promise<{ survivorId: string; points: number; visits: number }> {
  const merge = await tx.retailCustomerMerge.findUnique({ where: { duplicateId } });
  if (!merge || merge.undoneAt || merge.companyId !== actor.companyId) {
    throw new CustomerRefusal("That is not in the bin", 409, {});
  }
  await lockPair(tx, merge.survivorId, duplicateId);
  const rows = await tx.customer.findMany({ where: { id: { in: [merge.survivorId, duplicateId] } }, select: SELECT });
  const survivor = rows.find((row) => row.id === merge.survivorId)!;
  const duplicate = rows.find((row) => row.id === duplicateId)!;
  if (duplicate.mergedIntoId !== survivor.id) throw new CustomerRefusal("That is not in the bin", 409, {});
  if (survivor.archivedAt || survivor.mergedIntoId) {
    throw new CustomerRefusal(`Restore ${survivor.name} first.`, 409, {});
  }

  // The points that go back: the duplicate's own, those of customers merged into it before, and
  // those written since on the survivor for the duplicate's sales (a refund's REVERSED row, say).
  const chain = await mergedChain(tx, duplicateId);
  const ofItsSales = [{ saleId: { in: merge.saleIds } }, { sale: { sourceSaleId: { in: merge.saleIds } } }];
  const moving: Prisma.RetailPointsEntryWhereInput = { customerId: survivor.id, OR: [{ mergedFromId: { in: chain } }, ...ofItsSales] };
  const [movingSum, held] = await Promise.all([
    tx.retailPointsEntry.aggregate({ where: moving, _sum: { points: true } }),
    pointsOf(tx, survivor.id),
  ]);
  const points = movingSum._sum.points ?? 0;
  if (held - points < 0) throw new CustomerRefusal(spentSentence(survivor.name, duplicate.name), 409, {});

  // The numbers: the survivor's old one back while it still holds the duplicate's.
  const phoneBack = merge.survivorPhoneBefore !== null && survivor.phone === duplicate.phone;
  const survivorPhone = phoneBack ? merge.survivorPhoneBefore : survivor.phone;
  await lockPhones(tx, actor.companyId, [survivorPhone, duplicate.phone]);
  for (const [phone, who] of [
    [survivorPhone, survivor],
    [duplicate.phone, duplicate],
  ] as const) {
    if (!phone) continue;
    const holder = await tx.customer.findFirst({
      where: { companyId: actor.companyId, phone, archivedAt: null, mergedIntoId: null, id: { notIn: [survivor.id, duplicate.id] } },
      select: { name: true },
    });
    if (holder) throw new CustomerRefusal(`${holder.name} has ${who.name}’s number now. Change one of them first.`, 409, {});
  }
  if (survivorPhone && survivorPhone === duplicate.phone) {
    throw new CustomerRefusal(`${survivor.name} has ${duplicate.name}’s number now. Change one of them first.`, 409, {});
  }

  const back = (ids: string[]) => ({ id: { in: ids }, customerId: survivor.id });
  await tx.retailSale.updateMany({ where: back(merge.saleIds), data: { customerId: duplicate.id } });
  // Refunds and voids of its sales written since the merge go back with them.
  await tx.retailSale.updateMany({ where: { sourceSaleId: { in: merge.saleIds }, customerId: survivor.id }, data: { customerId: duplicate.id } });
  await tx.retailLayby.updateMany({ where: back(merge.laybyIds), data: { customerId: duplicate.id } });
  await tx.retailVoucher.updateMany({ where: back(merge.voucherIds), data: { customerId: duplicate.id } });
  await tx.retailCustomerNote.updateMany({ where: back(merge.noteIds), data: { customerId: duplicate.id } });
  await tx.retailPointsEntry.updateMany({ where: moving, data: { customerId: duplicate.id } });
  await tx.retailPointsEntry.updateMany({ where: { customerId: duplicate.id, mergedFromId: duplicate.id }, data: { mergedFromId: null } });

  // What the merge filled goes, unless someone has changed it since.
  const cleared = (merge.filledFields as Fillable[]).filter((field) => {
    const held = survivor[field];
    const was = duplicate[field];
    return held instanceof Date && was instanceof Date ? held.getTime() === was.getTime() : held === was;
  });
  await tx.customer.update({
    where: { id: survivor.id },
    data: { ...Object.fromEntries(cleared.map((field) => [field, null])), ...(phoneBack ? { phone: survivorPhone } : {}) },
  });
  await tx.customer.update({ where: { id: duplicate.id }, data: { mergedIntoId: null, archivedAt: null, isActive: true } });
  await tx.retailCustomerMerge.update({ where: { id: merge.id }, data: { undoneAt: now, undoneById: actor.userId } });

  const visits = await visitsOf(tx, duplicate.id, now);
  for (const [entity, other, role] of [
    [survivor, duplicate, "survivor"],
    [duplicate, survivor, "duplicate"],
  ] as const) {
    await writeRetailAuditEvent(tx, {
      actor,
      eventType: RETAIL_AUDIT_EVENTS.customerUnmerged,
      entityType: "Customer",
      entityId: entity.id,
      payload: { other: { id: other.id, name: other.name, phone: other.phone }, role, points, visits },
    });
  }
  return { survivorId: survivor.id, points, visits };
}
