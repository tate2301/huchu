/**
 * Undo everywhere (books-final §4.1, §2.5, §5.12, §5.13): the rules, pure, so
 * a test walks them one by one. `undo.ts` reads the facts and does the work.
 *
 * - **Void** a posted document: its mirror posts and it stays, marked void
 *   with who and why. An issued sales invoice is voided through a full credit
 *   note instead, fiscalised when it was (§4.1 rule 4). Payments on an
 *   invoice or a bill never stop a void: they are taken off it and stay on
 *   the party's account. Refused, with the rule named, while today's month is
 *   closed (the void has nowhere to post), while one of its bank lines sits
 *   in a closed reconciliation, or while later documents the spec names
 *   stand on it (a debit note or write-off on a bill, an invoice raised from
 *   a quote, goods received on an order): those are undone first.
 * - **Revise** is Void, then a new draft linked to it (D7), which takes its
 *   number at issue. Only invoices, quotes, bills and credit notes have it.
 * - **Delete** a draft: whoever may edit it. **Delete permanently** anything
 *   posted: the owner, in an open month, never fiscalised (a test device's
 *   documents excepted, D18), never counted in a finalised VAT return, never
 *   with a bank line in a closed reconciliation. School fees and till sales
 *   are their own modules' to correct, never deleted from Books.
 */

/** Every document Books can undo, as the core's routes name it (`/api/books/core/<kind>`). */
export const UNDO_KINDS = [
  "invoice",
  "credit-note",
  "receipt",
  "quote",
  "bill",
  "debit-note",
  "payment",
  "purchase-order",
  "requisition",
  "claim",
  "voucher",
  "journal",
  "bank-entry",
  "retail-sale",
  "layby",
  "school-fee-invoice",
  "school-fee-receipt",
] as const;

export type UndoKind = (typeof UNDO_KINDS)[number];

export const isUndoKind = (value: string): value is UndoKind => (UNDO_KINDS as readonly string[]).includes(value);

/** What each is called in a sentence, and the table the audit trail names it by. */
export const UNDO_NOUN: Record<UndoKind, { noun: string; plural: string; entity: string; event: string }> = {
  invoice: { noun: "invoice", plural: "invoices", entity: "SalesInvoice", event: "invoice" },
  "credit-note": { noun: "credit note", plural: "credit notes", entity: "CreditNote", event: "credit-note" },
  receipt: { noun: "payment", plural: "payments", entity: "SalesReceipt", event: "receipt" },
  quote: { noun: "quote", plural: "quotes", entity: "SalesQuotation", event: "quote" },
  bill: { noun: "bill", plural: "bills", entity: "PurchaseBill", event: "bill" },
  "debit-note": { noun: "debit note", plural: "debit notes", entity: "DebitNote", event: "debit-note" },
  payment: { noun: "supplier payment", plural: "supplier payments", entity: "PurchasePayment", event: "payment-made" },
  "purchase-order": { noun: "purchase order", plural: "purchase orders", entity: "RetailPurchaseOrder", event: "purchase-order" },
  requisition: { noun: "requisition", plural: "requisitions", entity: "CrmRequisition", event: "requisition" },
  claim: { noun: "claim", plural: "claims", entity: "ExpenseClaim", event: "claim" },
  voucher: { noun: "petty cash voucher", plural: "petty cash vouchers", entity: "PettyCashVoucher", event: "voucher" },
  journal: { noun: "journal", plural: "journals", entity: "JournalEntry", event: "journal" },
  "bank-entry": { noun: "bank entry", plural: "bank entries", entity: "BANK_TRANSACTION", event: "bank-entry" },
  "retail-sale": { noun: "till sale", plural: "till sales", entity: "RetailSale", event: "retail-sale" },
  layby: { noun: "lay-by", plural: "lay-bys", entity: "RetailLayby", event: "layby" },
  "school-fee-invoice": { noun: "fee invoice", plural: "fee invoices", entity: "SchoolFeeInvoice", event: "school-fee-invoice" },
  "school-fee-receipt": { noun: "fee receipt", plural: "fee receipts", entity: "SchoolFeeReceipt", event: "school-fee-receipt" },
};

/** The documents Revise makes a new draft of (D7: they carry `supersedesId`). */
export const REVISABLE: ReadonlySet<UndoKind> = new Set<UndoKind>(["invoice", "quote", "bill", "credit-note"]);

/** Documents another module owns: Books posts for them and shows them, and sends a person to the module to change them. */
export const MODULE_OWNED: Partial<Record<UndoKind, string>> = {
  "retail-sale": "A till sale is voided or refunded at the till, or from Retail → Sales, which puts the stock and the drawer right too.",
  layby: "A lay-by is cancelled from Retail → Lay-bys, which pays the customer back and puts the goods on the shelf.",
  "school-fee-invoice": "A fee invoice is voided from Schools → Fees, which owns the family's account.",
  "school-fee-receipt": "A fee receipt is voided from Schools → Fees, which unwinds what it paid.",
};

export const REASON_MIN = 3;
export const REASON_MAX = 300;

export type Dependent = { kind: UndoKind | "write-off" | "goods-receipt"; id: string; label: string };

/** What the rules need to know about one document. */
export type UndoFacts = {
  kind: UndoKind;
  id: string;
  /** "INV-0143", or "Draft invoice" before it has a number. */
  label: string;
  /** Nothing posted yet: a draft, one waiting for approval, an order not sent. */
  draft: boolean;
  voided: boolean;
  /** Whether anything reached the ledger for it. */
  posted: boolean;
  /** The document's own date: its month is the one a delete changes. */
  date: Date;
  /** ZIMRA holds it: signed into a fiscal day or accepted by FDMS. */
  fiscalised: boolean;
  /** Signed on a device registered against ZIMRA's test environment (D18). */
  testDevice: boolean;
  /** Whose draft it is ("own drafts only" for a clerk). */
  ownerId: string | null;
  /** Later documents that stand on it and are still live: the void is refused until they are undone. */
  dependents: Dependent[];
  /** Payments on it that a void or delete takes off it and leaves on the party's account. */
  onAccount?: Dependent[];
  /** Cannot be undone this way at all, and why (a retail requisition, a cash payout from a requisition). */
  blocked?: string | null;
};

/** Where it stands in time and at the bank, read from the books. */
export type UndoContext = {
  /** "October 2026 is closed": money dated today may not post. */
  todayHeld?: string | null;
  /** "September 2026 is closed", "The books are frozen up to 2026-09-30": its own month may not change. */
  monthHeld?: string | null;
  /** "Stanbic USD to 30 Sep 2026": a bank line of it is in a closed reconciliation. */
  closedReconciliation?: string | null;
  /** "the VAT return for September 2026": counted in one that is finalised or filed. */
  vatReturn?: string | null;
};

const joined = (parts: string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** "PAY-0003 and DN-0001": what stands on it, by number. */
export function dependentsSentence(dependents: Dependent[]): string {
  const labels = dependents.map((dependent) => dependent.label);
  return labels.length > 4 ? `${labels.slice(0, 3).join(", ")} and ${labels.length - 3} more` : joined(labels);
}

/** Why it may not be voided now (the rule named), or null when it may. Who may is `canDo`'s, not this. */
export function voidRefusal(facts: UndoFacts, context: UndoContext = {}): string | null {
  const owned = MODULE_OWNED[facts.kind];
  if (owned) return owned;
  if (facts.blocked) return facts.blocked;
  if (facts.voided) return `${facts.label} is void already.`;
  if (facts.draft) return `${facts.label} is a draft and nothing was posted: delete it instead.`;
  if (facts.dependents.length) {
    const what = dependentsSentence(facts.dependents);
    return `${what} ${facts.dependents.length === 1 ? "stands" : "stand"} on ${facts.label}. Void ${facts.dependents.length === 1 ? "it" : "them"} first.`;
  }
  if (context.closedReconciliation) return `${facts.label} has a bank line in a closed reconciliation (${context.closedReconciliation}). The owner reopens it first.`;
  if (context.todayHeld) return `${context.todayHeld}, and a void posts today. The owner reopens it first.`;
  return null;
}

/** Why it may not be revised (void, then a new draft). */
export function reviseRefusal(facts: UndoFacts, context: UndoContext = {}): string | null {
  if (!REVISABLE.has(facts.kind)) return `A ${UNDO_NOUN[facts.kind].noun} is not revised: void it and make a new one.`;
  if (facts.kind === "credit-note" && facts.fiscalised) return `${facts.label} was fiscalised, so it is never voided or revised. Issue a new invoice, or a debit note, for the difference.`;
  if (facts.draft && !facts.voided) return `${facts.label} is a draft: change it directly.`;
  return voidRefusal(facts, context);
}

/** Why it may not be deleted for good (owner, posted), or null when it may. */
export function deleteRefusal(facts: UndoFacts, context: UndoContext = {}): string | null {
  if (facts.kind === "school-fee-invoice" || facts.kind === "school-fee-receipt") return "School fees are never deleted from Books: Schools → Fees owns them.";
  if (facts.kind === "retail-sale" || facts.kind === "layby") return MODULE_OWNED[facts.kind]!;
  if (facts.blocked) return facts.blocked;
  if (facts.fiscalised && !facts.testDevice) return `${facts.label} was fiscalised, so ZIMRA holds it as issued and it is never deleted. Void it with a credit note instead.`;
  if (context.monthHeld) return `${context.monthHeld}, so its figures have been reported. Void it instead.`;
  if (context.vatReturn) return `${facts.label} is counted in ${context.vatReturn}, which is finalised. Void it instead.`;
  if (context.closedReconciliation) return `${facts.label} has a bank line in a closed reconciliation (${context.closedReconciliation}). Void it instead, or the owner reopens the reconciliation.`;
  return null;
}

/** A reason of 3 to 300 characters, trimmed; null when it is too short. */
export function reasonOf(reason: string | null | undefined): string | null {
  const text = (reason ?? "").trim();
  return text.length < REASON_MIN ? null : text.slice(0, REASON_MAX);
}

/** The bulk actions (§5.13), each a row at a time. */
export const BULK_ACTIONS = ["send", "remind", "void", "delete", "mark-paid", "export"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];
export const isBulkAction = (value: string): value is BulkAction => (BULK_ACTIONS as readonly string[]).includes(value);

export const BULK_LIMIT = 500;

export type BulkRow = { id: string; label: string };
export type BulkResult = {
  action: BulkAction;
  kind: UndoKind;
  done: Array<BulkRow & { detail?: string }>;
  skipped: Array<BulkRow & { why: string }>;
  failed: Array<BulkRow & { why: string }>;
  /** Export only: the rows, as CSV. */
  csv?: string;
};

/** "3 invoices voided. 2 skipped." */
export function bulkSummary(result: BulkResult): string {
  const noun = UNDO_NOUN[result.kind];
  const verb = { send: "sent", remind: "reminded", void: "voided", delete: "deleted", "mark-paid": "marked paid", export: "exported" }[result.action];
  const n = result.done.length;
  const head = n === 0 ? `Nothing was ${verb}.` : `${n} ${n === 1 ? noun.noun : noun.plural} ${verb}.`;
  const tail = [result.skipped.length ? `${result.skipped.length} skipped.` : null, result.failed.length ? `${result.failed.length} failed.` : null].filter(Boolean).join(" ");
  return tail ? `${head} ${tail}` : head;
}

/**
 * What a void does, line by line, for the dialog (books-final §4.1, §4.3,
 * §4.8): the credit note or the mirror, the fiscal device, the payments left
 * on account. One line each, no explanations.
 */
export function voidEffects(facts: Pick<UndoFacts, "kind" | "label" | "fiscalised" | "onAccount">, now?: Date): string[] {
  const onAccount = facts.onAccount ?? [];
  const lines: string[] = [];
  if (facts.kind === "invoice") {
    lines.push(facts.fiscalised ? `A full credit note is issued and signed, citing ${facts.label}` : "A full credit note is issued and posted");
    if (onAccount.length) lines.push(`${dependentsSentence(onAccount)} ${onAccount.length === 1 ? "stays" : "stay"} on the customer’s account`);
    lines.push("Commission not yet paid on it is voided");
    // The month the note is dated in: its VAT return takes the output VAT off.
    if (now) lines.push(`${now.toLocaleString("en-GB", { month: "long", timeZone: "UTC" })}’s VAT return counts the credit note`);
    return lines;
  }
  if (facts.kind === "credit-note") return [`Its posting is reversed, dated today`, "The invoice is owed again"];
  lines.push(facts.kind === "journal" ? "A reversing journal posts, dated today" : "Its posting is reversed, dated today");
  if (facts.kind === "bill" && onAccount.length) lines.push(`${dependentsSentence(onAccount)} ${onAccount.length === 1 ? "stays" : "stay"} as credit with the supplier`);
  if (facts.kind === "receipt" || facts.kind === "payment" || facts.kind === "bank-entry") lines.push("Its bank line goes and the statement line is matched again");
  if (facts.kind === "receipt") lines.push("Commission not yet paid on it is voided");
  return lines;
}

/** What the fiscal device makes of a void, or null when it has no part (§4.17). */
export function voidFiscalNote(facts: Pick<UndoFacts, "kind" | "label" | "fiscalised" | "testDevice">): string | null {
  if (!facts.fiscalised) return null;
  if (facts.kind === "invoice") return `${facts.label} is signed on FDMS, so it is voided with a fiscal credit note that cites it.${facts.testDevice ? " The device is ZIMRA’s test environment." : ""}`;
  if (facts.kind === "credit-note") return `${facts.label} is signed on FDMS: it is never voided. Issue a new invoice for the amount instead.`;
  return null;
}

/** What a permanent delete keeps (§2.5): payments on account and the snapshot. */
export function deleteKeeps(facts: Pick<UndoFacts, "kind" | "onAccount">): string[] {
  const onAccount = facts.onAccount ?? [];
  const party = facts.kind === "bill" || facts.kind === "debit-note" || facts.kind === "payment" ? "the supplier’s" : "the customer’s";
  return [
    ...(onAccount.length ? [`${dependentsSentence(onAccount)} ${onAccount.length === 1 ? "stays" : "stay"} on ${party} account`] : ["Payments on it stay on account"]),
    "A snapshot of it is kept in the audit trail",
    "Its number is never given out again",
  ];
}

/** "delete 5": what a bulk delete wants typed. */
export const bulkDeleteWord = (count: number) => `delete ${count}`;

/** What a person may do with one document (the core's `undoChoices`), for the ▾ menu and the dialogs. */
export type UndoChoices = {
  kind: UndoKind;
  id: string;
  label: string;
  status: "draft" | "posted" | "void";
  void: { allowed: boolean; why: string | null };
  revise: { allowed: boolean; why: string | null };
  delete: { allowed: boolean; why: string | null; permanent: boolean };
  /** When it was voided, revised or deleted: who, when and why, from the audit trail. */
  voided: { by: string | null; at: string; reason: string | null } | null;
  supersededBy: string | null;
  supersedes: string | null;
  fiscalised: boolean;
  /** What a void does, one line each (`voidEffects`). */
  effects: string[];
  /** What the fiscal device makes of it (`voidFiscalNote`). */
  fiscalNote: string | null;
  /** The later documents that stand on it, by number. */
  dependents: string[];
  /** The payments on it a void leaves on account, by number. */
  onAccount: string[];
  /** An invoice's void: the number its credit note will take. */
  nextNote: string | null;
  /** What a permanent delete keeps (`deleteKeeps`). */
  keeps: string[];
};

/** Which bulk undo a list offers this person (`undoRights`). */
export type UndoRights = { kind: UndoKind; void: boolean; revise: boolean; deletePosted: boolean; deleteDrafts: boolean };
