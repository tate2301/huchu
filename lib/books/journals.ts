import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { monthName, shortDay, storedDay } from "./format";

/**
 * Books → Journals (design/core-modules/boards/view/PageBooksJournals.html):
 * every journal, its state and where it came from, with the drafts that hold
 * a month open called out; and one journal's lines beside the list.
 */

export const JOURNAL_TABS = ["all", "draft", "posted", "reversed", "voided"] as const;
export type JournalTab = (typeof JOURNAL_TABS)[number];
const STATUS: Record<Exclude<JournalTab, "all">, "DRAFT" | "POSTED" | "REVERSED" | "VOIDED"> = {
  draft: "DRAFT",
  posted: "POSTED",
  reversed: "REVERSED",
  voided: "VOIDED",
};

export const JOURNAL_PAGE_SIZE = 50;

export const journalQuerySchema = z.object({
  tab: z.enum(JOURNAL_TABS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  page: z.coerce.number().int().min(1).catch(1),
});
export type JournalQuery = z.infer<typeof journalQuerySchema>;

export type JournalState = "draft" | "posted" | "reversed" | "voided";

export type JournalRow = {
  id: string;
  ref: string;
  /** "9 Oct". */
  date: string;
  memo: string;
  /** "Sales invoice", "Manual". */
  source: string;
  amount: number;
  state: JournalState;
};

export type JournalsView = {
  finding: { fact: string; rest: string | null };
  counts: Record<JournalTab, number>;
  rows: JournalRow[];
  range: { from: number; to: number; of: number };
  draftTotal: number;
  query: JournalQuery;
};

export type JournalDetail = {
  id: string;
  ref: string;
  state: JournalState;
  memo: string;
  /** "30 Sep 2026 · FY2026 · September · Manual". */
  meta: string;
  lines: Array<{ code: string; account: string; debit: number; credit: number; memo: string | null }>;
  totals: { debit: number; credit: number };
  /** What posting it takes: "September is open, so this can post without a reason." */
  periodNote: string | null;
  /** The period is closed: posting needs a reason. */
  needsReason: boolean;
};

/** "JE-0421". */
export const journalRef = (entryNumber: number) => `JE-${String(entryNumber).padStart(4, "0")}`;

/** SALES_INVOICE → "Sales invoice"; MANUAL → "Manual". */
export function sourceLabel(sourceType: string): string {
  const words = sourceType.toLowerCase().split("_");
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "2 journals are still in draft." / "Both are dated September, so September cannot close until they post." */
export function journalsFinding(drafts: Array<{ month: string }>): { fact: string; rest: string | null } {
  if (drafts.length === 0) return { fact: "Every journal is posted.", rest: null };
  const months = [...new Set(drafts.map((draft) => draft.month))];
  const fact = drafts.length === 1 ? "1 journal is still in draft." : `${drafts.length} journals are still in draft.`;
  if (months.length === 1) {
    const who = drafts.length === 1 ? "It is" : drafts.length === 2 ? "Both are" : "All are";
    return { fact, rest: `${who} dated ${months[0]}, so ${months[0]} cannot close until ${drafts.length === 1 ? "it posts" : "they post"}.` };
  }
  const list = `${months.slice(0, -1).join(", ")} and ${months.at(-1)}`;
  return { fact, rest: `They are dated ${list}, which cannot close until they post.` };
}

type Db = Pick<PrismaClient, "journalEntry">;

function where(companyId: string, query: JournalQuery): Prisma.JournalEntryWhereInput {
  const filter: Prisma.JournalEntryWhereInput = { companyId };
  if (query.tab !== "all") filter.status = STATUS[query.tab];
  if (query.q) {
    const number = Number(query.q.replace(/^je-?/i, ""));
    filter.OR = [
      { description: { contains: query.q, mode: "insensitive" } },
      ...(Number.isInteger(number) && number > 0 ? [{ entryNumber: number }] : []),
    ];
  }
  return filter;
}

const amountOf = (lines: Array<{ debit: number; credit: number }>) => {
  const debit = lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = lines.reduce((sum, line) => sum + line.credit, 0);
  return Math.round(Math.max(debit, credit) * 100) / 100;
};

export async function readJournals(db: Db, companyId: string, query: JournalQuery): Promise<JournalsView> {
  const filter = where(companyId, query);
  const [records, matching, grouped, drafts] = await Promise.all([
    db.journalEntry.findMany({
      where: filter,
      select: { id: true, entryNumber: true, entryDate: true, description: true, sourceType: true, status: true, lines: { select: { debit: true, credit: true } } },
      orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
      skip: (query.page - 1) * JOURNAL_PAGE_SIZE,
      take: JOURNAL_PAGE_SIZE,
    }),
    db.journalEntry.count({ where: filter }),
    db.journalEntry.groupBy({ by: ["status"], where: { companyId }, _count: true }),
    db.journalEntry.findMany({
      where: { companyId, status: "DRAFT" },
      select: { entryDate: true, lines: { select: { debit: true, credit: true } } },
      orderBy: { entryDate: "asc" },
    }),
  ]);
  const by = (status: string) => grouped.find((group) => group.status === status)?._count ?? 0;
  const counts: Record<JournalTab, number> = {
    all: grouped.reduce((sum, group) => sum + group._count, 0),
    draft: by("DRAFT"),
    posted: by("POSTED"),
    reversed: by("REVERSED"),
    voided: by("VOIDED"),
  };
  const from = matching === 0 ? 0 : (query.page - 1) * JOURNAL_PAGE_SIZE + 1;
  return {
    finding: journalsFinding(drafts.map((draft) => ({ month: monthName(storedDay(draft.entryDate)) }))),
    counts,
    rows: records.map((record) => ({
      id: record.id,
      ref: journalRef(record.entryNumber),
      date: shortDay(storedDay(record.entryDate)),
      memo: record.description,
      source: sourceLabel(record.sourceType),
      amount: amountOf(record.lines),
      state: record.status.toLowerCase() as JournalState,
    })),
    range: { from, to: from === 0 ? 0 : from + records.length - 1, of: matching },
    draftTotal: Math.round(drafts.reduce((sum, draft) => sum + amountOf(draft.lines), 0) * 100) / 100,
    query,
  };
}

export async function readJournal(db: Db, companyId: string, id: string): Promise<JournalDetail | null> {
  const entry = await db.journalEntry.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      entryNumber: true,
      entryDate: true,
      description: true,
      status: true,
      sourceType: true,
      period: { select: { startDate: true, status: true } },
      lines: {
        select: { debit: true, credit: true, memo: true, account: { select: { code: true, name: true } } },
        orderBy: [{ debit: "desc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!entry) return null;
  const day = storedDay(entry.entryDate);
  const date = new Date(`${day}T00:00:00Z`);
  const period = entry.period ? `FY${entry.period.startDate.getUTCFullYear()} · ${monthName(storedDay(entry.period.startDate))}` : null;
  const month = monthName(day);
  const closed = entry.period?.status === "CLOSED";
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    id: entry.id,
    ref: journalRef(entry.entryNumber),
    state: entry.status.toLowerCase() as JournalState,
    memo: entry.description,
    meta: [`${date.getUTCDate()} ${shortDay(day).split(" ")[1]} ${date.getUTCFullYear()}`, period, sourceLabel(entry.sourceType)].filter(Boolean).join(" · "),
    lines: entry.lines.map((line) => ({ code: line.account.code, account: line.account.name, debit: line.debit, credit: line.credit, memo: line.memo })),
    totals: {
      debit: round(entry.lines.reduce((sum, line) => sum + line.debit, 0)),
      credit: round(entry.lines.reduce((sum, line) => sum + line.credit, 0)),
    },
    periodNote:
      entry.status !== "DRAFT"
        ? null
        : closed
          ? `${month} is closed, so posting this needs a reason.`
          : `${month} is open, so this can post without a reason.`,
    needsReason: entry.status === "DRAFT" && closed,
  };
}

/** The list as it is filtered, every page, for Export. */
export async function journalsCsv(db: Db, companyId: string, query: JournalQuery): Promise<string> {
  const records = await db.journalEntry.findMany({
    where: where(companyId, query),
    select: { entryNumber: true, entryDate: true, description: true, sourceType: true, status: true, lines: { select: { debit: true, credit: true } } },
    orderBy: [{ entryDate: "desc" }, { entryNumber: "desc" }],
    take: 10_000,
  });
  const cell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = ["Ref,Date,Memo,Source,Amount,Status"];
  for (const record of records) {
    lines.push(
      [journalRef(record.entryNumber), storedDay(record.entryDate), record.description, sourceLabel(record.sourceType), amountOf(record.lines).toFixed(2), record.status.charAt(0) + record.status.slice(1).toLowerCase()]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}
