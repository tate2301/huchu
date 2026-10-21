import type { Prisma, PrismaClient } from "@prisma/client";

import { blockingWhere } from "./needs-posting";

/**
 * What a workspace without the Books screens sees at a Books address
 * (books-final §1.2, BkUpsell): the core's own figures, so the screens are
 * never what stands between an owner and their books.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type UpsellFacts = {
  /** Journals on the ledger (posted, reversed or voided: each is an entry the books hold). */
  entries: number;
  /** The first entry's date, ISO day. */
  since: string | null;
  /** Money that has not reached the ledger yet: failed, or waiting over an hour. */
  waiting: number;
};

export type UpsellView = {
  finding: { fact: string; rest: string };
  /** The owner adds Books; everyone else asks the owner. */
  canAdd: boolean;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "1 Mar 2026", as bk-x-noscreens writes the books' first day. */
export function sinceWords(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number) as [number, number, number];
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export function upsellView(facts: UpsellFacts, role: string | null | undefined): UpsellView {
  const entries = new Intl.NumberFormat("en-GB").format(facts.entries);
  const fact =
    facts.entries > 0 && facts.since
      ? `Your books hold ${entries} ${facts.entries === 1 ? "entry" : "entries"} since ${sinceWords(facts.since)}.`
      : "Your books are ready.";
  const rest =
    facts.waiting > 0
      ? `${new Intl.NumberFormat("en-GB").format(facts.waiting)} ${facts.waiting === 1 ? "is" : "are"} still waiting to post.`
      : facts.entries > 0
        ? "Every sale, payment and pay run has posted from the first day."
        : "Every sale, payment and pay run posts here.";
  return { finding: { fact, rest }, canAdd: role === "SUPERADMIN" };
}

export async function readUpsellFacts(db: Db, companyId: string, now = new Date()): Promise<UpsellFacts> {
  const [entries, first, waiting] = await Promise.all([
    db.journalEntry.count({ where: { companyId, status: { not: "DRAFT" } } }),
    db.journalEntry.findFirst({ where: { companyId, status: { not: "DRAFT" } }, orderBy: { entryDate: "asc" }, select: { entryDate: true } }),
    db.accountingIntegrationEvent.count({ where: blockingWhere(companyId, now) }),
  ]);
  return { entries, since: first ? first.entryDate.toISOString().slice(0, 10) : null, waiting };
}
