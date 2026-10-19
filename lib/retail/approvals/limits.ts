import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { ApprovalChannel, CountApprovalRule, PriceChangeRule } from "./words";

/**
 * Approvals and limits (80-admin 4.2, ADM-04): one row per company in
 * `RetailApprovalSettings`, read by every area through `getApprovalLimits`.
 * A shop that has never saved the page has the model's defaults. BUY-04,
 * STK-04, STK-06, CUS-07, ADM-05 and the Roles sheet read it, and since
 * Books P2 it is the company's money limits too (D10): Books' approvals
 * (`lib/books/core/approvals.ts`) read the same row.
 */

type Client = Prisma.TransactionClient | typeof prisma;

export type ApprovalLimits = {
  requisitionOwnerOver: Prisma.Decimal;
  ownerApproverId: string | null;
  /** The approver named on the page while they are an active owner, else the first active owner. */
  ownerApprover: { id: string; name: string; phone: string | null } | null;
  priceChanges: PriceChangeRule;
  belowCostNeedsOwner: boolean;
  adjustmentPinOver: Prisma.Decimal;
  countDifferences: CountApprovalRule;
  countOwnerOver: Prisma.Decimal;
  accountOwnerOver: Prisma.Decimal;
  /** D10: bills and supplier payments over this wait for the owner. */
  paymentOwnerOver: Prisma.Decimal;
  /** D10: an accountant's manual journal over this needs a second person. */
  journalSecondOver: Prisma.Decimal;
  /** D10: a petty cash voucher under this posts on the float holder's word alone. */
  voucherHolderUnder: Prisma.Decimal;
  askBy: ApprovalChannel;
};

/** The model's defaults: a shop with no row reads these. */
export const APPROVAL_DEFAULTS = {
  requisitionOwnerOver: "500.00",
  priceChanges: "MANAGERS",
  belowCostNeedsOwner: true,
  adjustmentPinOver: "50.00",
  countDifferences: "OWNER_OVER_LIMIT",
  countOwnerOver: "100.00",
  accountOwnerOver: "250.00",
  paymentOwnerOver: "500.00",
  journalSecondOver: "1000.00",
  voucherHolderUnder: "20.00",
  askBy: "WHATSAPP_AND_APP",
} as const;

/** The company's active owners, oldest first. */
export async function activeOwners(companyId: string, client: Client = prisma) {
  return client.user.findMany({
    where: { companyId, isActive: true, role: "SUPERADMIN" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, phone: true },
  });
}

export async function getApprovalLimits(companyId: string, client: Client = prisma): Promise<ApprovalLimits> {
  const [row, owners] = await Promise.all([
    client.retailApprovalSettings.findUnique({ where: { companyId } }),
    activeOwners(companyId, client),
  ]);
  const ownerApproverId = row?.ownerApproverId ?? null;
  const named = ownerApproverId ? owners.find((owner) => owner.id === ownerApproverId) : undefined;
  const approver = named ?? owners[0] ?? null;
  return {
    requisitionOwnerOver: row?.requisitionOwnerOver ?? new Prisma.Decimal(APPROVAL_DEFAULTS.requisitionOwnerOver),
    ownerApproverId,
    ownerApprover: approver ? { id: approver.id, name: approver.name, phone: approver.phone ?? null } : null,
    priceChanges: row?.priceChanges ?? APPROVAL_DEFAULTS.priceChanges,
    belowCostNeedsOwner: row?.belowCostNeedsOwner ?? APPROVAL_DEFAULTS.belowCostNeedsOwner,
    adjustmentPinOver: row?.adjustmentPinOver ?? new Prisma.Decimal(APPROVAL_DEFAULTS.adjustmentPinOver),
    countDifferences: row?.countDifferences ?? APPROVAL_DEFAULTS.countDifferences,
    countOwnerOver: row?.countOwnerOver ?? new Prisma.Decimal(APPROVAL_DEFAULTS.countOwnerOver),
    accountOwnerOver: row?.accountOwnerOver ?? new Prisma.Decimal(APPROVAL_DEFAULTS.accountOwnerOver),
    paymentOwnerOver: row?.paymentOwnerOver ?? new Prisma.Decimal(APPROVAL_DEFAULTS.paymentOwnerOver),
    journalSecondOver: row?.journalSecondOver ?? new Prisma.Decimal(APPROVAL_DEFAULTS.journalSecondOver),
    voucherHolderUnder: row?.voucherHolderUnder ?? new Prisma.Decimal(APPROVAL_DEFAULTS.voucherHolderUnder),
    askBy: row?.askBy ?? APPROVAL_DEFAULTS.askBy,
  };
}
