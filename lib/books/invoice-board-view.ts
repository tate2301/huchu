/** What BkInvoice draws beyond the invoice itself (`lib/books/invoice-board.ts` reads it). No database here. */
export type InvoiceBoardExtras = {
  payments: Array<{ id: string; number: string; date: string; how: string; bankLine: "Matched" | "To match" | "No bank line" | "Void"; amount: number; voided: boolean }>;
  /** Each ledger line, the entry's number and date on its first line only. */
  posting: Array<{ entry: string; date: string; account: string; debit: number | null; credit: number | null }>;
  entries: number;
  /** Newest first. tone: "" planned or drafted, "in" issued or sent, "ok" signed or paid, "wa" credited or voided. */
  history: Array<{ tone: "" | "in" | "ok" | "wa"; text: string; when: string }>;
  /** The people the history names, with their photos (owner, 19 Oct: avatars). */
  faces?: Record<string, string | null>;
  fiscal: { status: "Valid" | "Failed" | "Pending" | "Void"; code: string | null; day: number | null; signed: string | null; qr: string | null; error: string | null } | null;
  /** "27.00, RBZ interbank", or none for the books' own currency. */
  rate: string;
  /** "6 Oct, from QT-0386". */
  issued: string | null;
  /** The cost centre its sales lines posted to, when one was chosen. */
  costCentre: string | null;
};
