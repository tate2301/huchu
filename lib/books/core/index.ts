/**
 * Books core (books-final §1.1): the one entry point every module calls to
 * move money. Free, always on, whatever the plan. Modules import only this.
 */
export { postMoney, moneyLedgerAccount, type MoneyEvent, type PostMoneyResult } from "./post-money";
export { voidMoney, VoidRefused, type VoidMoneyInput, type VoidMoneyResult } from "./void-money";
export { recordEvent, RecordEventRefused, type RecordedEvent } from "./record-event";
export { rateFor, type FrozenRate } from "./rate";
export { nextNumber, NoSeriesYet, type NumberedDocument } from "./numbering";
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
