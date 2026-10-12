import type { RetailVoucherFunding } from "@prisma/client";

import { postRetailJournal, type RetailAccountingResult } from "@/app/api/v2/retail/_helpers";
import { prisma } from "@/lib/prisma";

/**
 * Vouchers in the books (PRD-10, 20-products §3.3). Posted after the commit
 * that changed the voucher, like every retail journal, and kept with the
 * event for an end-of-day shop's run:
 *
 * - given in the back office: Dr Promotions and gifts / Cr Vouchers owed,
 *   one journal for the vouchers one request issued;
 * - voided or lapsed with money left: Dr Vouchers owed / Cr Other income
 *   (sold, or a refund's credit note) or Cr Promotions and gifts (given).
 *
 * A gift voucher sold at the till is the sale's own journal (Cr Vouchers owed
 * by `vouchersSoldAmount`); one spent is the sale's VOUCHER tender (Dr).
 */

type Who = { companyId: string; userId: string | null; userRole?: string | null };

async function actorId(who: Who): Promise<string | null> {
  if (who.userId) return who.userId;
  // The worker has no one: the shop's first person, as the ledger's backfill does.
  const first = await prisma.user.findFirst({
    where: { companyId: who.companyId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

const cents = (value: number) => Math.round(value * 100) / 100;

export async function postVoucherIssue(
  who: Who,
  input: { firstId: string; codes: string[]; total: number; siteId: string | null; at: Date },
): Promise<RetailAccountingResult | null> {
  const createdById = await actorId(who);
  if (!createdById || input.total <= 0) return null;
  const amount = cents(input.total);
  const what = input.codes.length === 1 ? input.codes[0]! : `${input.codes[0]} and ${input.codes.length - 1} more`;
  return postRetailJournal({
    companyId: who.companyId,
    sourceType: "RETAIL_VOUCHER_ISSUE",
    sourceId: input.firstId,
    siteId: input.siteId,
    entryDate: input.at,
    description: `Vouchers given ${what}`,
    createdById,
    actorRole: who.userRole ?? undefined,
    amount,
    netAmount: amount,
    taxAmount: 0,
    grossAmount: amount,
    payload: { count: input.codes.length },
  });
}

/** What was left on it, written off: to other income when it was paid for, back off promotions when it was given. */
export async function postVoucherWriteOff(
  who: Who,
  input: {
    sourceType: "RETAIL_VOUCHER_VOID" | "RETAIL_VOUCHER_EXPIRY";
    voucherId: string;
    code: string;
    funding: RetailVoucherFunding;
    left: number;
    siteId: string | null;
    at: Date;
  },
): Promise<RetailAccountingResult | null> {
  const createdById = await actorId(who);
  if (!createdById || input.left <= 0) return null;
  const amount = cents(input.left);
  const given = input.funding === "GIVEN";
  return postRetailJournal({
    companyId: who.companyId,
    sourceType: input.sourceType,
    sourceId: input.voucherId,
    sourceSubtype: input.funding,
    siteId: input.siteId,
    entryDate: input.at,
    description: `${input.sourceType === "RETAIL_VOUCHER_VOID" ? "Voucher voided" : "Voucher expired"} ${input.code}`,
    createdById,
    actorRole: who.userRole ?? undefined,
    amount,
    netAmount: amount,
    taxAmount: 0,
    grossAmount: amount,
    // Both always numbers, one of them zero (its line is dropped).
    payload: { paidLeft: given ? 0 : amount, givenLeft: given ? amount : 0 },
  });
}
