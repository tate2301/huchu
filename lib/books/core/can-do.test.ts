/**
 * The permission matrix (books-final §2.2), cell by cell: Y may, L within the
 * limit, O own records only, – may not. The outside accountant is the owner's tier.
 */
import { describe, expect, it } from "vitest";

import { auditActor, canDo, tierOf, type BooksAction, type BooksActor, type BooksDoc } from "./can-do";

const me = "user-me";
const someoneElse = "user-other";
const as = (role: string, extra: Partial<BooksActor> = {}): BooksActor => ({ companyId: "c", userId: me, role, ...extra });
const ok = (actor: BooksActor, action: BooksAction, doc?: BooksDoc) => canDo(actor, action, doc).allowed;

const owner = as("SUPERADMIN");
const manager = as("MANAGER");
const accountant = as("FINANCE_OFFICER");
const bursar = as("BURSAR");
const shop = as("SHOP_MANAGER");
const clerk = as("CLERK");
const rep = as("SALES_REP");
const superuser = as("CLERK", { signInAs: { id: "s", number: 214, operatorName: "Rudo", mode: "CHANGE", until: "2099-01-01T00:00:00Z" } });
const looking = as("SUPERADMIN", { signInAs: { id: "s", number: 215, operatorName: "Rudo", mode: "LOOK", until: "2099-01-01T00:00:00Z" } });

describe("who is who", () => {
  it("reads the owner, the superuser and each role's tier", () => {
    expect(tierOf(owner)).toBe("owner");
    expect(tierOf(superuser)).toBe("owner");
    expect(tierOf(manager)).toBe("manager");
    expect(tierOf(accountant)).toBe("accountant");
    expect(tierOf(bursar)).toBe("bursar");
    expect(tierOf(shop)).toBe("shop");
    for (const role of ["CLERK", "SALES_REP", "SALES_EXEC", "CASHIER", "STOCK_CLERK"]) expect(tierOf(as(role))).toBe("clerk");
    expect(tierOf(as("TEACHER"))).toBe("none");
  });

  it("records the operator and the session for a superuser", () => {
    expect(auditActor(superuser)).toEqual({ userId: me, role: "CLERK", superuser: { operator: "Rudo", session: "SA-214" } });
    expect(auditActor(owner)).toEqual({ userId: me, role: "SUPERADMIN" });
    expect(auditActor({ ...accountant, outsideAccountant: { firmName: "Mutasa & Co" } })).toEqual({ userId: me, role: "FINANCE_OFFICER", outsideAccountant: { firm: "Mutasa & Co" } });
  });
});

describe("the matrix", () => {
  it("lets each role see its part of Books", () => {
    for (const actor of [owner, manager, accountant]) expect(ok(actor, "view", { area: "ledger" })).toBe(true);
    expect(ok(bursar, "view", { area: "sales" })).toBe(true);
    expect(ok(bursar, "view", { area: "bank" })).toBe(true);
    expect(ok(bursar, "view", { area: "ledger" })).toBe(false);
    expect(ok(shop, "view", { area: "takings" })).toBe(true);
    expect(ok(shop, "view", { area: "sales" })).toBe(false);
    expect(ok(clerk, "view", { area: "sales" })).toBe(false);
    // A rep's own requests, and the CRM's documents at their Books address (permissions.json: own requests).
    expect(ok(clerk, "view", { area: "bills" })).toBe(true);
    expect(ok(clerk, "view", { area: "sales", module: "crm" })).toBe(true);
    expect(ok(clerk, "view", { area: "ledger" })).toBe(false);
  });

  it("drafts: everyone in their module, a clerk only their own", () => {
    for (const action of ["draft.create", "draft.edit", "draft.delete"] as const) {
      for (const actor of [owner, manager, accountant]) expect(ok(actor, action, { kind: "invoice" })).toBe(true);
      expect(ok(bursar, action, { module: "fees" })).toBe(true);
      expect(ok(bursar, action, { module: "books" })).toBe(false);
      expect(ok(shop, action, { module: "retail" })).toBe(true);
      expect(ok(shop, action, { module: "books" })).toBe(false);
    }
    expect(ok(clerk, "draft.create", { kind: "invoice" })).toBe(true);
    expect(ok(clerk, "draft.edit", { kind: "invoice", ownerId: me })).toBe(true);
    expect(ok(clerk, "draft.edit", { kind: "invoice", ownerId: someoneElse })).toBe(false);
    expect(ok(clerk, "draft.delete", { kind: "invoice", ownerId: someoneElse })).toBe(false);
  });

  it("issue: a clerk issues receipts and CRM invoices only", () => {
    for (const actor of [owner, manager, accountant]) expect(ok(actor, "issue", { kind: "bill" })).toBe(true);
    expect(ok(bursar, "issue", { kind: "invoice", module: "fees" })).toBe(true);
    expect(ok(bursar, "issue", { kind: "invoice" })).toBe(false);
    expect(ok(shop, "issue", { kind: "receipt", module: "retail" })).toBe(true);
    expect(ok(rep, "issue", { kind: "receipt" })).toBe(true);
    expect(ok(rep, "issue", { kind: "invoice", module: "crm" })).toBe(true);
    expect(ok(rep, "issue", { kind: "invoice" })).toBe(false);
    expect(ok(rep, "issue", { kind: "bill" })).toBe(false);
  });

  it("journals: the accountant within the limit", () => {
    expect(ok(owner, "journal.post", { amount: 1e9 })).toBe(true);
    expect(ok(manager, "journal.post", { amount: 1e9 })).toBe(true);
    expect(ok(accountant, "journal.post", { amount: 500 })).toBe(true);
    expect(ok(as("FINANCE_OFFICER", { limit: 1000 }), "journal.post", { amount: 1500 })).toBe(false);
    expect(ok(as("FINANCE_OFFICER", { limit: 1000 }), "journal.post", { amount: 900 })).toBe(true);
    for (const actor of [bursar, shop, clerk]) expect(ok(actor, "journal.post")).toBe(false);
  });

  it("approve and pay: within the limit, never your own request, the owner included", () => {
    for (const action of ["approve", "pay"] as const) {
      expect(ok(owner, action, { ownerId: someoneElse, amount: 1e6 })).toBe(true);
      expect(ok(owner, action, { ownerId: me })).toBe(false);
      expect(ok(manager, action, { ownerId: someoneElse })).toBe(true);
      expect(ok(manager, action, { ownerId: me })).toBe(false);
      expect(ok(as("MANAGER", { limit: 100 }), action, { ownerId: someoneElse, amount: 101 })).toBe(false);
      expect(ok(accountant, action, { ownerId: someoneElse })).toBe(true);
      expect(ok(shop, action, { ownerId: someoneElse, module: "retail" })).toBe(true);
      expect(ok(shop, action, { ownerId: someoneElse, module: "crm" })).toBe(false);
      expect(ok(bursar, action, { ownerId: someoneElse })).toBe(false);
      expect(ok(clerk, action, { ownerId: someoneElse })).toBe(false);
    }
  });

  it("credit and debit notes, write-offs", () => {
    for (const actor of [owner, manager, accountant]) expect(ok(actor, "note.issue")).toBe(true);
    expect(ok(bursar, "note.issue", { module: "fees" })).toBe(true);
    expect(ok(shop, "note.issue", { module: "retail" })).toBe(false);
    expect(ok(clerk, "note.issue")).toBe(false);
    for (const actor of [owner, manager, accountant]) expect(ok(actor, "write-off", { amount: 50 })).toBe(true);
    expect(ok(as("MANAGER", { limit: 10 }), "write-off", { amount: 50 })).toBe(false);
    for (const actor of [bursar, shop, clerk]) expect(ok(actor, "write-off")).toBe(false);
  });

  const outside = as("FINANCE_OFFICER", { outsideAccountant: { firmName: "Mutasa & Co" } });

  it("void and revise: the owner, a superuser and the outside accountant; no one else", () => {
    for (const action of ["void", "revise"] as const) {
      for (const actor of [owner, superuser, outside]) expect(ok(actor, action)).toBe(true);
      for (const actor of [manager, accountant, bursar, shop, clerk]) expect(ok(actor, action)).toBe(false);
    }
    expect(canDo(manager, "void")).toEqual({ allowed: false, reason: "Only the owner or the outside accountant can void or revise a posted document." });
  });

  it("the outside accountant has the owner's rights: permanent delete, reopening a month, the freeze date", () => {
    expect(tierOf(outside)).toBe("owner");
    for (const action of ["delete.posted", "period.reopen", "period.freeze"] as const) {
      expect(ok(owner, action)).toBe(true);
      expect(ok(superuser, action)).toBe(true);
      expect(ok(outside, action)).toBe(true);
      expect(ok(manager, action)).toBe(false);
      expect(ok(accountant, action)).toBe(false);
    }
    expect(canDo(manager, "period.reopen")).toEqual({ allowed: false, reason: "Only the owner or the outside accountant can reopen a month." });
  });

  it("an outside accountant whose access has ended is a finance officer with no role in Books", () => {
    expect(tierOf({ ...accountant, role: null })).toBe("none");
    expect(ok({ ...accountant, role: null }, "view", { area: "bills" })).toBe(false);
  });

  it("closing a month, posting into a closed one, VAT and setup", () => {
    for (const actor of [owner, manager, accountant]) expect(ok(actor, "period.close")).toBe(true);
    for (const actor of [bursar, shop, clerk]) expect(ok(actor, "period.close")).toBe(false);
    expect(ok(manager, "period.override")).toBe(true);
    expect(ok(accountant, "period.override")).toBe(false);
    expect(ok(accountant, "vat.prepare")).toBe(true);
    expect(ok(accountant, "vat.file")).toBe(false);
    expect(ok(manager, "vat.file")).toBe(true);
    expect(ok(accountant, "setup")).toBe(true);
    expect(ok(manager, "setup")).toBe(false);
  });

  it("Needs posting: retry for the money people, map an account for the owner and the accountant", () => {
    for (const actor of [owner, manager, accountant]) expect(ok(actor, "posting.retry")).toBe(true);
    expect(ok(clerk, "posting.retry")).toBe(false);
    expect(ok(owner, "posting.map")).toBe(true);
    expect(ok(accountant, "posting.map")).toBe(true);
    expect(ok(manager, "posting.map")).toBe(false);
    expect(ok(owner, "posting.redate")).toBe(true);
    expect(ok(accountant, "posting.redate")).toBe(false);
  });

  it("look only changes nothing, even as the owner", () => {
    expect(ok(looking, "view", { area: "ledger" })).toBe(true);
    expect(canDo(looking, "issue")).toEqual({ allowed: false, reason: "You signed in to look only, so nothing can be changed." });
    expect(ok(looking, "void")).toBe(false);
  });
});
