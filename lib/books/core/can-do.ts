import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import type { SignInAsClaim } from "@/lib/sign-in-as/limits";

import { isWorkspaceOwner } from "../owner";
import { outsideAccessOpen, type OutsideAccountant } from "../outside-accountant";

/**
 * Who may do what in Books: the one permission check (books-final §2.2).
 *
 * Pure: `canDo(actor, action, doc)` reads only what it is given, so the
 * matrix is a table a test walks cell by cell. `booksActor(session)` is the
 * one read that builds an actor, with the outside accountant when it is one.
 *
 * - **Owner**: `SUPERADMIN` (`lib/books/owner.ts`).
 * - **Superuser**: a Corelith operator signed in as a member in "Make
 *   changes" mode. They have the owner's powers for support, and every
 *   destructive act records them (`actor.superuser`). "Look only" may only
 *   look.
 * - **Outside accountant**: from the firm that audits or keeps the books,
 *   with an access end date. The owner's rights in Books until that day,
 *   every act marked as theirs (`auditActor`). Only they and the owner void,
 *   revise, delete permanently or reopen a month: a manager or a staff
 *   accountant never does.
 */

export type BooksTier = "owner" | "manager" | "accountant" | "bursar" | "shop" | "clerk" | "none";

export type BooksActor = {
  companyId: string;
  userId: string;
  role: string | null | undefined;
  /** Set when the person is an outside accountant whose access is open today. */
  outsideAccountant?: OutsideAccountant | null;
  /** The operator's Sign in as session, when it is one. */
  signInAs?: SignInAsClaim | null;
  /** The approval limit, where one is set; none means no limit is enforced yet. */
  limit?: number | null;
};

export type BooksAction =
  | "view"
  | "draft.create"
  | "draft.edit"
  | "draft.delete"
  | "issue"
  | "journal.post"
  | "approve"
  | "pay"
  | "note.issue"
  | "write-off"
  | "void"
  | "revise"
  | "delete.posted"
  | "period.close"
  | "period.reopen"
  | "period.freeze"
  | "period.override"
  | "vat.prepare"
  | "vat.file"
  | "setup"
  | "posting.retry"
  | "posting.map"
  /** Post money held for a closed month in the current month instead (D14). */
  | "posting.redate"
  /** Bank rights (§4.13): match, unmatch, exclude statement lines; start a reconciliation. */
  | "bank.match"
  /** A bank entry: a charge, IMTT, interest, a transfer or a tax payment. */
  | "bank.entry"
  | "reconciliation.close"
  | "reconciliation.reopen"
  | "reconciliation.void";

export type BooksDocKind =
  | "invoice"
  | "quotation"
  | "receipt"
  | "credit-note"
  | "bill"
  | "payment"
  | "debit-note"
  | "write-off"
  | "journal"
  | "period"
  | "requisition"
  | "purchase-order"
  | "claim"
  | "voucher"
  | "commission"
  | "vat-return"
  | "bank"
  | "event";

export type BooksDoc = {
  kind?: BooksDocKind;
  /** The module the document belongs to: a bursar works fees, a shop manager retail. */
  module?: "books" | "fees" | "retail" | "crm";
  /** Who made or requested it: "own records only" and "never your own request". */
  ownerId?: string | null;
  amount?: number | null;
  /** For `view`: which part of Books. */
  area?: "sales" | "bank" | "takings" | "bills" | "ledger" | "tax" | "close";
};

export type Decision = { allowed: true } | { allowed: false; reason: string };

const ALLOW: Decision = { allowed: true };
const refuse = (reason: string): Decision => ({ allowed: false, reason });

const CLERKS = new Set(["CLERK", "SALES_REP", "SALES_EXEC", "CASHIER", "STOCK_CLERK"]);

/** The operator in "Make changes" mode: the owner's powers, recorded. */
export function isSuperuser(actor: Pick<BooksActor, "signInAs">): boolean {
  return actor.signInAs?.mode === "CHANGE";
}

export function tierOf(actor: Pick<BooksActor, "role" | "signInAs" | "outsideAccountant">): BooksTier {
  if (isWorkspaceOwner(actor.role) || isSuperuser(actor) || actor.outsideAccountant) return "owner";
  const role = (actor.role ?? "").trim().toUpperCase();
  if (role === "MANAGER") return "manager";
  if (role === "FINANCE_OFFICER") return "accountant";
  if (role === "BURSAR") return "bursar";
  if (role === "SHOP_MANAGER") return "shop";
  if (CLERKS.has(role)) return "clerk";
  return "none";
}

/** L: within their approval limit, where one is set. */
function withinLimit(actor: BooksActor, doc: BooksDoc, what: string): Decision {
  if (actor.limit == null || doc.amount == null || doc.amount <= actor.limit) return ALLOW;
  return refuse(`This is over your limit for ${what}, so the owner has to.`);
}

const OWN = (actor: BooksActor, doc: BooksDoc) => Boolean(doc.ownerId) && doc.ownerId === actor.userId;

const OWNER_ONLY: Partial<Record<BooksAction, string>> = {
  "delete.posted": "Only the owner or the outside accountant can delete something that has been posted. Void it instead.",
  "period.reopen": "Only the owner or the outside accountant can reopen a month.",
  "period.freeze": "Only the owner or the outside accountant can set the freeze date.",
  "posting.redate": "Only the owner or the outside accountant can move money from a closed month into this one.",
  "reconciliation.reopen": "Only the owner or the outside accountant can reopen a closed reconciliation.",
  "reconciliation.void": "Only the owner or the outside accountant can void a reconciliation.",
};

export function canDo(actor: BooksActor, action: BooksAction, doc: BooksDoc = {}): Decision {
  // Look only: nothing changes, whatever the member could do.
  if (actor.signInAs?.mode === "LOOK" && action !== "view") {
    return refuse("You signed in to look only, so nothing can be changed.");
  }
  const tier = tierOf(actor);
  const docModule = doc.module ?? "books";

  // Maker-checker (§2.4): nobody approves or pays their own request, the owner included.
  if ((action === "approve" || action === "pay") && OWN(actor, doc)) {
    return refuse(action === "approve" ? "Somebody else has to approve your own request." : "Somebody else has to pay out your own request.");
  }

  if (tier === "owner") return ALLOW;
  if (OWNER_ONLY[action]) return refuse(OWNER_ONLY[action]!);

  switch (action) {
    case "view": {
      if (tier === "manager" || tier === "accountant") return ALLOW;
      if (tier === "bursar") return doc.area === "sales" || doc.area === "bank" ? ALLOW : refuse("A bursar sees Sales and Bank & cash in Books.");
      if (tier === "shop") return doc.area === "bank" || doc.area === "takings" ? ALLOW : refuse("A shop manager sees Bank & cash and Takings in Books.");
      // A rep or fitter sees their own requests in Bills & spending, and the
      // CRM's quotes, invoices and receipts at their one address in Books
      // (design/books/spec/permissions.json; NOTES §2). The readers show them
      // only their own: what they asked for, made or own the deal of.
      if (tier === "clerk" && (doc.area === "bills" || (doc.area === "sales" && docModule === "crm"))) return ALLOW;
      return refuse("Ask the owner for access to Books.");
    }
    case "draft.create":
    case "draft.edit":
    case "draft.delete": {
      if (tier === "manager" || tier === "accountant") return ALLOW;
      if (tier === "bursar") return docModule === "fees" ? ALLOW : refuse("A bursar works on school fees only.");
      if (tier === "shop") return docModule === "retail" ? ALLOW : refuse("A shop manager works on the shop's documents only.");
      if (tier === "clerk") {
        if (action === "draft.create" || OWN(actor, doc)) return ALLOW;
        return refuse("You can change your own drafts only.");
      }
      return refuse("Your role cannot change documents in Books.");
    }
    case "issue": {
      if (tier === "manager" || tier === "accountant") return ALLOW;
      if (tier === "bursar") return docModule === "fees" ? ALLOW : refuse("A bursar issues school fee documents only.");
      if (tier === "shop") return docModule === "retail" ? ALLOW : refuse("A shop manager issues the shop's documents only.");
      if (tier === "clerk") {
        if (doc.kind === "receipt" || (docModule === "crm" && doc.kind === "invoice")) return ALLOW;
        return refuse("You can record receipts and issue CRM invoices. Ask a manager or the accountant to issue this.");
      }
      return refuse("Your role cannot issue documents.");
    }
    case "journal.post": {
      if (tier === "manager") return ALLOW;
      if (tier === "accountant") return withinLimit(actor, doc, "journals");
      return refuse("Only the owner, a manager or the accountant can post a journal.");
    }
    case "approve":
    case "pay": {
      const what = action === "approve" ? "approvals" : "payments";
      if (tier === "manager" || tier === "accountant") return withinLimit(actor, doc, what);
      if (tier === "shop") return docModule === "retail" ? withinLimit(actor, doc, what) : refuse("A shop manager approves and pays the shop's requests only.");
      return refuse(action === "approve" ? "Only the owner, a manager or the accountant can approve." : "Only the owner, a manager or the accountant can pay out.");
    }
    case "note.issue": {
      if (tier === "manager" || tier === "accountant") return ALLOW;
      if (tier === "bursar") return docModule === "fees" ? ALLOW : refuse("A bursar issues credit notes on school fees only.");
      return refuse("Only the owner, a manager or the accountant can issue a credit or debit note.");
    }
    case "write-off": {
      if (tier === "manager" || tier === "accountant") return withinLimit(actor, doc, "write-offs");
      return refuse("Only the owner, a manager or the accountant can write off a debt.");
    }
    case "void":
    case "revise":
      return refuse("Only the owner or the outside accountant can void or revise a posted document.");
    case "period.close":
      return tier === "manager" || tier === "accountant" ? ALLOW : refuse("Only the owner, a manager or the accountant can close a month.");
    case "period.override":
      return tier === "manager" ? ALLOW : refuse("Only the owner or a manager can post into a closed month.");
    case "vat.prepare":
      return tier === "manager" || tier === "accountant" ? ALLOW : refuse("Only the owner, a manager or the accountant can prepare the VAT return.");
    case "vat.file":
      return tier === "manager" ? ALLOW : refuse("Only the owner or a manager can finalise and file the VAT return.");
    case "setup":
      return tier === "accountant" ? ALLOW : refuse("Only the owner or the accountant can change the chart, rules, tax codes and rates.");
    case "posting.retry":
      return tier === "manager" || tier === "accountant" ? ALLOW : refuse("Only the owner, a manager or the accountant can retry a posting.");
    case "bank.match": {
      if (tier === "manager" || tier === "accountant") return ALLOW;
      if (tier === "bursar") return docModule === "fees" ? ALLOW : refuse("A bursar matches the school's bank lines only.");
      if (tier === "shop") return docModule === "retail" ? ALLOW : refuse("A shop manager matches the shop's bank lines only.");
      return refuse("Only the owner, a manager or the accountant can match bank lines.");
    }
    case "bank.entry":
      return tier === "manager" || tier === "accountant" ? ALLOW : refuse("Only the owner, a manager or the accountant can record a bank entry.");
    case "reconciliation.close":
      return tier === "manager" || tier === "accountant" ? ALLOW : refuse("Only the owner, a manager or the accountant can close a reconciliation.");
    case "posting.map":
      return tier === "accountant" ? ALLOW : refuse("Only the owner or the accountant can map an account.");
    default:
      return refuse("Your role cannot do that in Books.");
  }
}

/**
 * The person as Books sees them, from their session. A finance officer who is
 * an outside accountant is lifted to the owner's rights while their access is
 * open; once it has ended they have none in Books at all.
 */
export async function booksActor(session: AuthenticatedSession): Promise<BooksActor> {
  const base: BooksActor = {
    companyId: session.user.companyId,
    userId: session.user.id,
    role: session.user.role,
    signInAs: session.user.signInAs ?? null,
  };
  if (tierOf(base) !== "accountant") return base;
  const member = await prisma.user.findUnique({ where: { id: session.user.id }, select: { memberKind: true, firmName: true, accessEndsOn: true } });
  if (member?.memberKind !== "OUTSIDE_ACCOUNTANT") return base;
  if (!outsideAccessOpen(member.accessEndsOn)) return { ...base, role: null };
  return { ...base, outsideAccountant: { firmName: member.firmName ?? "" } };
}

/** What the audit trail keeps about who did it: the member, the firm when an outside accountant, and the operator when it was one. */
export function auditActor(actor: BooksActor) {
  return {
    userId: actor.userId,
    role: actor.role ?? null,
    ...(actor.outsideAccountant ? { outsideAccountant: { firm: actor.outsideAccountant.firmName } } : {}),
    ...(isSuperuser(actor) && actor.signInAs
      ? { superuser: { operator: actor.signInAs.operatorName, session: `SA-${actor.signInAs.number}` } }
      : {}),
  };
}
