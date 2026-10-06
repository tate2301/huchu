import { prisma } from "@/lib/prisma";
import { APPROVAL_DEFAULTS, activeOwners } from "@/lib/retail/approvals/limits";
import {
  ASK_BY_WORDS,
  countDifferencesWords,
  PRICE_CHANGE_WORDS,
  ruleOf,
  type ApprovalChannel,
  type CountApprovalRule,
  type PriceChangeRule,
} from "@/lib/retail/approvals/words";
import { PICK_AN_OWNER } from "@/lib/retail/settings-pages/approvals";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Approvals page's values (W-58): `RetailApprovalSettings` as the page
 * writes them — money "500.00", the rules' labels, the owner approver as the
 * picked person. A shop with no row shows the defaults.
 */

export const approvalsSettings: SettingsStore = {
  async load(companyId) {
    const row = await prisma.retailApprovalSettings.findUnique({
      where: { companyId },
      include: { ownerApprover: { select: { id: true, name: true } } },
    });
    const countOwnerOver = row?.countOwnerOver.toFixed(2) ?? APPROVAL_DEFAULTS.countOwnerOver;
    const countWords = countDifferencesWords(countOwnerOver);
    return {
      requisitionOwnerOver: row?.requisitionOwnerOver.toFixed(2) ?? APPROVAL_DEFAULTS.requisitionOwnerOver,
      ownerApproverId: row?.ownerApprover
        ? { id: row.ownerApprover.id, label: row.ownerApprover.name, sub: "Owner" }
        : null,
      priceChanges: PRICE_CHANGE_WORDS[row?.priceChanges ?? APPROVAL_DEFAULTS.priceChanges],
      belowCostNeedsOwner: row?.belowCostNeedsOwner ?? APPROVAL_DEFAULTS.belowCostNeedsOwner,
      adjustmentPinOver: row?.adjustmentPinOver.toFixed(2) ?? APPROVAL_DEFAULTS.adjustmentPinOver,
      countDifferences: countWords[row?.countDifferences ?? APPROVAL_DEFAULTS.countDifferences],
      accountOwnerOver: row?.accountOwnerOver.toFixed(2) ?? APPROVAL_DEFAULTS.accountOwnerOver,
      askBy: ASK_BY_WORDS[row?.askBy ?? APPROVAL_DEFAULTS.askBy],
      // Read-only: the count segment's two labels, the second built from the stored amount.
      countDifferencesOptions: [countWords.ANY_MANAGER, countWords.OWNER_OVER_LIMIT],
    };
  },

  async save(tx, actor, changes) {
    const data: {
      requisitionOwnerOver?: string;
      ownerApproverId?: string;
      priceChanges?: PriceChangeRule;
      belowCostNeedsOwner?: boolean;
      adjustmentPinOver?: string;
      countDifferences?: CountApprovalRule;
      accountOwnerOver?: string;
      askBy?: ApprovalChannel;
    } = {};
    if (typeof changes.requisitionOwnerOver === "string") data.requisitionOwnerOver = changes.requisitionOwnerOver;
    if (typeof changes.adjustmentPinOver === "string") data.adjustmentPinOver = changes.adjustmentPinOver;
    if (typeof changes.accountOwnerOver === "string") data.accountOwnerOver = changes.accountOwnerOver;
    if (typeof changes.belowCostNeedsOwner === "boolean") data.belowCostNeedsOwner = changes.belowCostNeedsOwner;
    if (changes.priceChanges !== undefined) data.priceChanges = ruleOf(PRICE_CHANGE_WORDS, changes.priceChanges) ?? undefined;
    if (changes.askBy !== undefined) data.askBy = ruleOf(ASK_BY_WORDS, changes.askBy) ?? undefined;
    if (typeof changes.countDifferences === "string") {
      data.countDifferences = changes.countDifferences === "Any manager" ? "ANY_MANAGER" : "OWNER_OVER_LIMIT";
    }
    if (changes.ownerApproverId !== undefined) {
      const picked = changes.ownerApproverId as { id?: unknown } | null;
      const id = typeof picked?.id === "string" ? picked.id : "";
      const owners = await activeOwners(actor.companyId, tx);
      if (!owners.some((owner) => owner.id === id)) {
        throw new SettingsRefused(PICK_AN_OWNER, { status: 400, field: "ownerApproverId" });
      }
      data.ownerApproverId = id;
    }
    await tx.retailApprovalSettings.upsert({
      where: { companyId: actor.companyId },
      update: { ...data, updatedById: actor.userId },
      create: { companyId: actor.companyId, ...data, updatedById: actor.userId },
    });
  },
};
