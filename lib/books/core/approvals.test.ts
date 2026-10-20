/**
 * Maker-checker and limits (books-final §2.4), rule by rule: nobody approves
 * or pays out their own request; over the limit only the owner approves; the
 * approver does not pay where somebody else may; a one-person shop still
 * works, and says so.
 */
import { describe, expect, it } from "vitest";

import { approvalNote, APPROVER_PAYS, decideApproval, decidePayment, OWN_APPROVAL, OWN_PAYMENT, ownerLimitFor, type MoneyRequest } from "./approvals";
import type { BooksActor } from "./can-do";

const actor = (userId: string, role: string, extra: Partial<BooksActor> = {}): BooksActor => ({ companyId: "c", userId, role, ...extra });
const owner = actor("owner", "SUPERADMIN");
const manager = actor("manager", "MANAGER");
const accountant = actor("accountant", "FINANCE_OFFICER");
const shop = actor("shop", "SHOP_MANAGER");
const rep = actor("rep", "SALES_REP");

const ask = (over: Partial<MoneyRequest> = {}): MoneyRequest => ({ kind: "requisition", module: "crm", requestedById: "rep", amount: 300, limit: 500, ...over });

describe("approving", () => {
  it("refuses your own request, the owner's included, while somebody else could approve it", () => {
    expect(decideApproval(manager, ask({ requestedById: "manager" }), { othersWhoCanApprove: 2 })).toEqual({ allowed: false, reason: OWN_APPROVAL });
    expect(decideApproval(owner, ask({ requestedById: "owner" }), { othersWhoCanApprove: 1 })).toEqual({ allowed: false, reason: OWN_APPROVAL });
  });

  it("lets a sole owner approve their own, and the record says so", () => {
    const decision = decideApproval(owner, ask({ requestedById: "owner", amount: 900 }), { othersWhoCanApprove: 0 });
    expect(decision).toEqual({ allowed: true, selfApproved: true });
    expect(approvalNote(decision)).toBe("Approved their own request: nobody else in the workspace can.");
    // A manager alone is still refused: the owner is there to ask.
    expect(decideApproval(manager, ask({ requestedById: "manager" }), { othersWhoCanApprove: 0 }).allowed).toBe(false);
    // Over the limit, only another owner could: with none, the owner's own big request is theirs.
    expect(decideApproval(owner, ask({ requestedById: "owner", amount: 900 }), { othersWhoCanApprove: 2, otherOwners: 0 })).toEqual({ allowed: true, selfApproved: true });
    expect(decideApproval(owner, ask({ requestedById: "owner", amount: 900 }), { othersWhoCanApprove: 2, otherOwners: 1 }).allowed).toBe(false);
    expect(decideApproval(owner, ask({ requestedById: "owner", amount: 300 }), { othersWhoCanApprove: 2, otherOwners: 0 }).allowed).toBe(false);
  });

  it("lets a manager or the accountant approve at or under the limit, and sends over it to the owner", () => {
    expect(decideApproval(manager, ask({ amount: 500 }), { othersWhoCanApprove: 1 })).toEqual({ allowed: true });
    expect(decideApproval(accountant, ask({ amount: 499.99 }), { othersWhoCanApprove: 1 })).toEqual({ allowed: true });
    expect(decideApproval(manager, ask({ amount: 500.01 }), { othersWhoCanApprove: 1, ownerName: "James Nyabadza" })).toEqual({
      allowed: false,
      reason: "Over $500.00 needs James Nyabadza.",
    });
    expect(decideApproval(owner, ask({ amount: 50_000 }), { othersWhoCanApprove: 1 })).toEqual({ allowed: true });
  });

  it("uses the role matrix unless the module's own permission is given", () => {
    expect(decideApproval(rep, ask({ requestedById: "manager" }), { othersWhoCanApprove: 1 }).allowed).toBe(false);
    expect(decideApproval(rep, ask({ requestedById: "manager" }), { othersWhoCanApprove: 1, roleAllowed: true }).allowed).toBe(true);
    expect(decideApproval(manager, ask(), { othersWhoCanApprove: 1, roleAllowed: false })).toEqual({ allowed: false, reason: "You cannot approve this." });
    expect(decideApproval(shop, ask({ module: "retail" }), { othersWhoCanApprove: 1 }).allowed).toBe(true);
    expect(decideApproval(shop, ask({ module: "crm" }), { othersWhoCanApprove: 1 }).allowed).toBe(false);
  });

  it("reads bills and payments against the payments limit, write-offs against the accounts one", () => {
    const limits = { requisitionOwnerOver: 500, paymentOwnerOver: 750, accountOwnerOver: 250 };
    expect(ownerLimitFor("requisition", limits)).toBe(500);
    expect(ownerLimitFor("purchase-order", limits)).toBe(500);
    expect(ownerLimitFor("claim", limits)).toBe(500);
    expect(ownerLimitFor("bill", limits)).toBe(750);
    expect(ownerLimitFor("payment", limits)).toBe(750);
    expect(ownerLimitFor("write-off", limits)).toBe(250);
    expect(ownerLimitFor("commission", limits)).toBeNull();
  });

  it("refuses anything at all in look-only sign in", () => {
    const looking = actor("op", "SUPERADMIN", { signInAs: { mode: "LOOK" } as never });
    expect(decideApproval(looking, ask(), { othersWhoCanApprove: 1 }).allowed).toBe(false);
  });
});

describe("paying out", () => {
  const paying = (over: Partial<Parameters<typeof decidePayment>[1]> = {}) => ({ ...ask(), approvedById: "owner", ...over });

  it("refuses your own request, unless nobody else in the workspace may pay", () => {
    expect(decidePayment(manager, paying({ requestedById: "manager" }), { othersWhoCanPay: 1 })).toEqual({ allowed: false, reason: OWN_PAYMENT });
    expect(decidePayment(owner, paying({ requestedById: "owner", approvedById: "owner" }), { othersWhoCanPay: 0 })).toEqual({ allowed: true, selfPaid: true, sameAsApprover: true });
  });

  it("keeps the approver from paying where two people may pay; a one-person shop does both and it is marked", () => {
    expect(decidePayment(owner, paying(), { othersWhoCanPay: 1 })).toEqual({ allowed: false, reason: APPROVER_PAYS });
    const alone = decidePayment(owner, paying(), { othersWhoCanPay: 0 });
    expect(alone).toEqual({ allowed: true, sameAsApprover: true });
    expect(approvalNote(alone, "Cash from the safe.")).toBe("Cash from the safe. Approved and paid by the same person.");
  });

  it("holds a manager to the limit unless the owner approved it", () => {
    expect(decidePayment(manager, paying({ amount: 900, approvedById: "accountant" }), { othersWhoCanPay: 1 }).allowed).toBe(false);
    expect(decidePayment(manager, paying({ amount: 900, ownerApproved: true }), { othersWhoCanPay: 1 })).toEqual({ allowed: true });
  });

  it("does not let a rep pay out", () => {
    expect(decidePayment(rep, paying({ requestedById: "manager" }), { othersWhoCanPay: 1 }).allowed).toBe(false);
  });
});
