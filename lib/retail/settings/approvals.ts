import { prisma } from "@/lib/prisma";
import { APPROVAL_DEFAULTS, activeOwners } from "@/lib/retail/approvals/limits";
import {
  ASK_BY_WORDS,
  COUNT_ANY_MANAGER,
  countDifferencesWords,
  PRICE_CHANGE_WORDS,
  ruleOf,
  type ApprovalChannel,
  type CountApprovalRule,
  type PriceChangeRule,
} from "@/lib/retail/approvals/words";
import { CHOOSE_COUNT_RULE, PICK_AN_OWNER } from "@/lib/retail/settings-pages/approvals";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Approvals page's values (W-58): `RetailApprovalSettings` as the page
 * writes them — money "500.00", the rules' labels, the owner approver as the
 * picked person while they are an active owner. A shop with no row shows the
 * defaults.
 */

/** "Owner approvals go to" as the page shows a picked owner. */
const ownerOption = (owner: { id: string; name: string }) => ({ id: owner.id, label: owner.name, sub: "Owner" });

export const approvalsSettings: SettingsStore = {
  async load(companyId) {
    const [row, owners] = await Promise.all([
      prisma.retailApprovalSettings.findUnique({ where: { companyId } }),
      activeOwners(companyId),
    ]);
    // A named approver who is no longer an active owner is not asked: every active owner is (null).
    const approver = row?.ownerApproverId ? owners.find((owner) => owner.id === row.ownerApproverId) : undefined;
    const countOwnerOver = row?.countOwnerOver.toFixed(2) ?? APPROVAL_DEFAULTS.countOwnerOver;
    const countWords = countDifferencesWords(countOwnerOver);
    return {
      requisitionOwnerOver: row?.requisitionOwnerOver.toFixed(2) ?? APPROVAL_DEFAULTS.requisitionOwnerOver,
      ownerApproverId: approver ? ownerOption(approver) : null,
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

  /**
   * The picked owner rebuilt from the database by id (nothing the client sent
   * reaches the audit), and the count rule only as one of the two labels the
   * page offers for the stored amount.
   */
  async resolve(companyId, values, before) {
    const resolved = { ...values };
    if (values.countDifferences !== undefined) {
      const offered = Array.isArray(before.countDifferencesOptions) ? before.countDifferencesOptions : [];
      if (!offered.includes(values.countDifferences)) {
        throw new SettingsRefused(CHOOSE_COUNT_RULE, { status: 400, field: "countDifferences" });
      }
    }
    if (values.ownerApproverId !== undefined) {
      const owner = (await activeOwners(companyId)).find((candidate) => candidate.id === values.ownerApproverId);
      if (!owner) throw new SettingsRefused(PICK_AN_OWNER, { status: 400, field: "ownerApproverId" });
      resolved.ownerApproverId = ownerOption(owner);
    }
    return resolved;
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
      // `resolve` let through only the two labels offered for the stored amount.
      data.countDifferences = changes.countDifferences === COUNT_ANY_MANAGER ? "ANY_MANAGER" : "OWNER_OVER_LIMIT";
    }
    if (changes.ownerApproverId !== undefined) {
      // `resolve` checked them; checked again inside the save in case they left meanwhile.
      const id = (changes.ownerApproverId as { id: string }).id;
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
