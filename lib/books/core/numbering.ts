import type { Prisma, PrismaClient } from "@prisma/client";

import { ID_ENTITY_CONFIG, reserveIdentifier, type ReservableIdEntity } from "@/lib/id-generator";

/**
 * `nextNumber`: the next number in a document's series (D8, books-final §4.1
 * rule 8). One series per type in `IdSequence` (`reserveIdentifier`), given
 * at issue and never at draft, so a deleted draft leaves no gap. The counter
 * row is locked until the issuing transaction ends: called inside it, two
 * people issuing at once get consecutive numbers, and a rolled-back issue
 * gives its number back. A series starts after the highest number of its
 * form already in the table; numbers of any other form are kept as they are.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type NumberedDocument =
  | "invoice"
  | "receipt"
  | "quotation"
  | "requisition"
  | "bill"
  | "payment"
  | "credit-note"
  | "debit-note"
  | "write-off"
  | "supplier-write-off"
  | "claim"
  | "voucher";

export const SERIES: Record<NumberedDocument, ReservableIdEntity> = {
  invoice: "SALES_INVOICE",
  receipt: "SALES_RECEIPT",
  quotation: "SALES_QUOTATION",
  requisition: "CRM_REQUISITION",
  bill: "PURCHASE_BILL",
  // One "PAY" series for every supplier payment, retail's groups included.
  payment: "RETAIL_SUPPLIER_PAYMENT",
  "credit-note": "SALES_CREDIT_NOTE",
  "debit-note": "PURCHASE_DEBIT_NOTE",
  "write-off": "SALES_WRITE_OFF",
  "supplier-write-off": "PURCHASE_WRITE_OFF",
  claim: "EXPENSE_CLAIM",
  voucher: "PETTY_CASH_VOUCHER",
};

export class NoSeriesYet extends Error {
  constructor(type: string) {
    super(`${type} has no numbered series yet.`);
    this.name = "NoSeriesYet";
  }
}

export async function nextNumber(db: Db, companyId: string, type: NumberedDocument | string, today = new Date()): Promise<string> {
  const entity = SERIES[type as NumberedDocument];
  if (!entity) throw new NoSeriesYet(type);
  const prefix = (await seriesPrefixes(db, companyId))[entity];
  if (prefix && today.toISOString().slice(0, 10) >= prefix.from) return reserveWithPrefix(db, companyId, entity, prefix);
  return reserveIdentifier(db, { companyId, entity });
}

/**
 * A series' prefix for a new year (Settings › Numbering, books-final §3.3):
 * "INV-27-" from 1 Jan 2027, its own count from 0001. Kept with the books'
 * settings (`AccountingSettings.taxSettings.numbering`, JSON, so no new
 * column); numbers already issued never change.
 */
export type SeriesPrefix = { prefix: string; from: string };

export async function seriesPrefixes(db: Db, companyId: string): Promise<Partial<Record<ReservableIdEntity, SeriesPrefix>>> {
  const row = await db.accountingSettings.findUnique({ where: { companyId }, select: { taxSettings: true } });
  const stored = row?.taxSettings && typeof row.taxSettings === "object" ? (row.taxSettings as { numbering?: Record<string, SeriesPrefix> }).numbering : undefined;
  return (stored ?? {}) as Partial<Record<ReservableIdEntity, SeriesPrefix>>;
}

/** Set (or clear, with a blank prefix) a series' prefix from a day. Never for a day already past: issued numbers stand. */
export async function setSeriesPrefix(db: Db, companyId: string, entity: ReservableIdEntity, prefix: string, from: string): Promise<void> {
  const clean = prefix.trim().toUpperCase();
  if (clean && !/^[A-Z0-9][A-Z0-9-]{0,11}$/.test(clean)) throw new Error("A prefix is letters, numbers and dashes, 12 at most.");
  const row = await db.accountingSettings.findUnique({ where: { companyId }, select: { taxSettings: true } });
  const current = (row?.taxSettings && typeof row.taxSettings === "object" ? row.taxSettings : {}) as Record<string, unknown> & { numbering?: Record<string, SeriesPrefix> };
  const numbering = { ...(current.numbering ?? {}) };
  if (clean) numbering[entity] = { prefix: clean, from };
  else delete numbering[entity];
  const json = { ...current, numbering } as unknown as Prisma.InputJsonValue;
  await db.accountingSettings.upsert({ where: { companyId }, update: { taxSettings: json }, create: { companyId, taxSettings: json } });
}

/** The next number under a year's prefix: its own counter row, locked like the series'. */
async function reserveWithPrefix(db: Db, companyId: string, entity: ReservableIdEntity, prefix: SeriesPrefix): Promise<string> {
  const scopeKey = `FROM:${prefix.from}`;
  const run = async (tx: Prisma.TransactionClient) => {
    await tx.idSequence.createMany({ data: [{ companyId, entityKey: entity, scopeKey, lastNumber: 0 }], skipDuplicates: true });
    const next = await tx.idSequence.update({ where: { companyId_entityKey_scopeKey: { companyId, entityKey: entity, scopeKey } }, data: { lastNumber: { increment: 1 } }, select: { lastNumber: true } });
    return `${prefix.prefix.endsWith("-") ? prefix.prefix : `${prefix.prefix}-`}${String(next.lastNumber).padStart(4, "0")}`;
  };
  if ("$transaction" in db) return (db as PrismaClient).$transaction(run);
  return run(db as Prisma.TransactionClient);
}

/**
 * The number a document is issued with: the one it already carries when that
 * is of its series' form (issued before, or a CRM number), else the next one
 * in the series. A draft made before D8 carries a random number, which is
 * replaced here, so every issued document's number is of the series.
 */
export async function numberAtIssue(db: Db, companyId: string, type: NumberedDocument, current?: string | null): Promise<string> {
  const { prefix } = ID_ENTITY_CONFIG[SERIES[type]];
  if (current && new RegExp(`^${prefix}-\\d+$`, "i").test(current.trim())) return current;
  const year = (await seriesPrefixes(db, companyId))[SERIES[type]];
  if (current && year && current.trim().toUpperCase().startsWith(year.prefix.endsWith("-") ? year.prefix : `${year.prefix}-`)) return current;
  return nextNumber(db, companyId, type);
}

const JOURNAL_SERIES = "JOURNAL_ENTRY";

/**
 * The next journal entry number (JE-0001 is `journalRef(1)`). Journals keep
 * an integer number, so the series is the highest entry plus one, taken under
 * the series row's lock: inside the posting transaction no two entries are
 * given the same number and none is skipped, whichever module posts.
 */
export async function nextJournalNumber(db: Db, companyId: string): Promise<number> {
  const run = async (tx: Prisma.TransactionClient) => {
    const where = { companyId_entityKey_scopeKey: { companyId, entityKey: JOURNAL_SERIES, scopeKey: "GLOBAL" } };
    await tx.idSequence.createMany({ data: [{ companyId, entityKey: JOURNAL_SERIES, scopeKey: "GLOBAL", lastNumber: 0 }], skipDuplicates: true });
    // Taking the row's lock first: whoever comes second waits here, then reads the first one's entry.
    await tx.idSequence.update({ where, data: { lastNumber: { increment: 0 } } });
    const highest = await tx.journalEntry.aggregate({ where: { companyId }, _max: { entryNumber: true } });
    const next = (highest._max.entryNumber ?? 0) + 1;
    await tx.idSequence.update({ where, data: { lastNumber: next } });
    return next;
  };
  if ("$transaction" in db) return (db as PrismaClient).$transaction(run);
  return run(db as Prisma.TransactionClient);
}
