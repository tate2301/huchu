import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { ApprovalChannel, CountApprovalRule, PriceChangeRule } from "./words";

/**
 * Approvals and limits (80-admin 4.2, ADM-04): one row per company in
 * `RetailApprovalSettings`, read by every area through `getApprovalLimits`.
 * A shop that has never saved the page has the model's defaults. BUY-04,
 * STK-04, STK-06, CUS-07, ADM-05 and the Roles sheet read it.
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
    askBy: row?.askBy ?? APPROVAL_DEFAULTS.askBy,
  };
}
