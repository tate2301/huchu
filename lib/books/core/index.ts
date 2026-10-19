/**
 * Books core (books-final §1.1): the one entry point every module calls to
 * move money. Free, always on, whatever the plan. Modules import only this.
 */
export { postMoney, moneyLedgerAccount, type MoneyEvent, type PostMoneyResult } from "./post-money";
export { markVoided, voidMoney, VoidRefused, type VoidMoneyInput, type VoidMoneyResult } from "./void-money";
export { recordEvent, RecordEventRefused, type RecordedEvent } from "./record-event";
export { rateFor, type FrozenRate } from "./rate";
export { nextJournalNumber, nextNumber, numberAtIssue, NoSeriesYet, SERIES, type NumberedDocument } from "./numbering";
export { fiscaliseIssuedInvoice, postInvoice, type InvoiceToPost } from "./issue-invoice";
export { ReceiptRefused, receiptFacts, type ReceiptFacts } from "./receipt-facts";
export { moneyInOut, type MoneyFlow, type MoneyFlowKey, type MoneyInOut } from "./money-in-out";
export { SUB_LEDGER_TYPES, writeMissingSubLedgerLines } from "./sub-ledger-backfill";
export { fiscalise, type FiscalDocument, type FiscaliseResult } from "./fiscalise";
export {
  auditActor,
  booksActor,
  canDo,
  isSuperuser,
  tierOf,
  VOID_GRANT,
  type BooksAction,
  type BooksActor,
  type BooksDoc,
  type BooksTier,
  type Decision,
} from "./can-do";
export { HELD_UNTIL, holdFor, isHeld } from "./holds";
export { guardBooks } from "./guard";
