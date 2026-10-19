import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import type { SignInAsClaim } from "@/lib/sign-in-as/limits";

import { isWorkspaceOwner } from "../owner";

/**
 * Who may do what in Books: the one permission check (books-final §2.2).
 *
 * Pure: `canDo(actor, action, doc)` reads only what it is given, so the
 * matrix is a table a test walks cell by cell. `booksActor(session)` is the
 * one read that builds an actor, with the "May void and revise" grant
 * (§2.3), which nobody has until the owner gives it.
 *
 * - **Owner**: `SUPERADMIN` (`lib/books/owner.ts`).
 * - **Superuser**: a Corelith operator signed in as a member in "Make
 *   changes" mode. They have the owner's powers for support, and every
 *   destructive act records them (`actor.superuser`). "Look only" may only
 *   look.
 * - **Void and revise** for a manager or an accountant only when granted
 *   (`books.void`, a `UserPermissionOverride`). Never permanent delete,
 *   reopening a month or changing a filed VAT return.
 */

export const VOID_GRANT = "books.void";

export type BooksTier = "owner" | "manager" | "accountant" | "bursar" | "shop" | "clerk" | "none";

export type BooksActor = {
  companyId: string;
  userId: string;
  role: string | null | undefined;
  /** Capabilities granted on top of the role: only `books.void` today. */
  grants?: ReadonlySet<string> | readonly string[];
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
  | "posting.redate";

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

export function tierOf(actor: Pick<BooksActor, "role" | "signInAs">): BooksTier {
  if (isWorkspaceOwner(actor.role) || isSuperuser(actor)) return "owner";
  const role = (actor.role ?? "").trim().toUpperCase();
  if (role === "MANAGER") return "manager";
  if (role === "FINANCE_OFFICER") return "accountant";
  if (role === "BURSAR") return "bursar";
  if (role === "SHOP_MANAGER") return "shop";
  if (CLERKS.has(role)) return "clerk";
  return "none";
}

const hasGrant = (actor: BooksActor, grant: string) =>
  actor.grants ? (actor.grants instanceof Set ? actor.grants.has(grant) : (actor.grants as readonly string[]).includes(grant)) : false;

/** L: within their approval limit, where one is set. */
function withinLimit(actor: BooksActor, doc: BooksDoc, what: string): Decision {
  if (actor.limit == null || doc.amount == null || doc.amount <= actor.limit) return ALLOW;
  return refuse(`This is over your limit for ${what}, so the owner has to.`);
}

const OWN = (actor: BooksActor, doc: BooksDoc) => Boolean(doc.ownerId) && doc.ownerId === actor.userId;

const OWNER_ONLY: Partial<Record<BooksAction, string>> = {
  "delete.posted": "Only the owner can delete something that has been posted. Void it instead.",
  "period.reopen": "Only the owner can reopen a month.",
  "period.freeze": "Only the owner can set the freeze date.",
  "posting.redate": "Only the owner can move money from a closed month into this one.",
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
    case "revise": {
      if ((tier === "manager" || tier === "accountant") && hasGrant(actor, VOID_GRANT)) return ALLOW;
      return refuse(
        tier === "manager" || tier === "accountant"
          ? "Only the owner can void or revise a posted document, unless they let you."
          : "Only the owner can void or revise a posted document.",
      );
    }
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
    case "posting.map":
      return tier === "accountant" ? ALLOW : refuse("Only the owner or the accountant can map an account.");
    default:
      return refuse("Your role cannot do that in Books.");
  }
}

/**
 * The person as Books sees them, from their session: the void grant read
 * from the override table, and only honoured for a manager or an accountant.
 */
export async function booksActor(session: AuthenticatedSession): Promise<BooksActor> {
  const base: BooksActor = {
    companyId: session.user.companyId,
    userId: session.user.id,
    role: session.user.role,
    signInAs: session.user.signInAs ?? null,
    grants: new Set<string>(),
  };
  const tier = tierOf(base);
  if (tier !== "manager" && tier !== "accountant") return base;
  const override = await prisma.userPermissionOverride.findUnique({
    where: { userId_permissionKey: { userId: session.user.id, permissionKey: VOID_GRANT } },
    select: { isAllowed: true, companyId: true },
  });
  return override?.isAllowed && override.companyId === session.user.companyId ? { ...base, grants: new Set([VOID_GRANT]) } : base;
}

/** What the audit trail keeps about who did it: the member, and the operator when it was one. */
export function auditActor(actor: BooksActor) {
  return {
    userId: actor.userId,
    role: actor.role ?? null,
    ...(isSuperuser(actor) && actor.signInAs
      ? { superuser: { operator: actor.signInAs.operatorName, session: `SA-${actor.signInAs.number}` } }
      : {}),
  };
}
