import type { Prisma, PrismaClient } from "@prisma/client";

import { captureAccountingEvent } from "@/lib/accounting/integration";
import { toNumber, type MoneyLike } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * `recordEvent`: a status change that moves no money (a work order moved to
 * In progress, a shift allocation submitted), kept on the integration log for
 * the record. It is the only way an event is written IGNORED, and it refuses
 * anything that could post: a source type or an amount (books-final §1.1).
 * Money goes through `postMoney`.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export class RecordEventRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RecordEventRefused";
  }
}

export type RecordedEvent = {
  companyId: string;
  sourceDomain: string;
  sourceAction: string;
  sourceId?: string | null;
  entryDate?: Date | null;
  description?: string | null;
  payload?: Record<string, unknown>;
  createdById?: string | null;
  siteId?: string | null;
};

const MONEY_FIELDS = ["amount", "netAmount", "taxAmount", "grossAmount", "deductionsAmount", "allowancesAmount"] as const;

export async function recordEvent(db: Db, event: RecordedEvent & Partial<Record<(typeof MONEY_FIELDS)[number], MoneyLike>> & { sourceType?: unknown }) {
  if (event.sourceType) throw new RecordEventRefused("A record-only event has no source type: money goes through postMoney.");
  for (const field of MONEY_FIELDS) {
    const value = toNumber(event[field]);
    if (value !== null && value !== undefined && value !== 0) {
      throw new RecordEventRefused(`A record-only event carries no ${field}: money goes through postMoney.`);
    }
  }
  return captureAccountingEvent(
    {
      companyId: event.companyId,
      sourceDomain: event.sourceDomain,
      sourceAction: event.sourceAction,
      sourceId: event.sourceId ?? null,
      siteId: event.siteId ?? null,
      entryDate: event.entryDate ?? null,
      description: event.description ?? null,
      payload: event.payload,
      createdById: event.createdById ?? null,
      status: "IGNORED",
    },
    db ?? prisma,
  );
}
