import { daysBetween, money, monthName, shortDay, weekday } from "./format";

/**
 * Books → Bank's matches (design/core-modules/spec/reports-and-books.md): for
 * each line of a bank statement, the one record it most likely is, and why.
 * Rules, not guesses: a line gets a match only when exactly one record fits.
 * Nothing here records anything; a person presses Accept.
 *
 * In the order they are tried:
 * 1. The reference names an open invoice ("inv142" is INV-0142) and the money
 *    in is no more than what is owed on it.
 * 2. Money out to a supplier, by name, for exactly what one open bill of
 *    theirs comes to.
 * 3. An EcoCash settlement for exactly the tills' EcoCash takings of the day
 *    before (EcoCash pays the tills out the next day).
 * 4. A bank transaction already recorded in the books for the same amount,
 *    the same way, within three days.
 * 5. A transfer that names another of the workspace's own accounts (by a
 *    distinctive word of its name or its last four digits) is proposed as a
 *    transfer between them.
 * 6. Money out that reads like IMTT is proposed as a bank entry to the IMTT
 *    account (books-final §5.8.3); like the bank's own charge, as bank
 *    charges, as it was filed before when it was.
 */

export type StatementLineInput = {
  id: string;
  /** `YYYY-MM-DD`. */
  date: string;
  description: string;
  reference: string | null;
  /** Always positive; `direction` says which way. */
  amount: number;
  direction: "CREDIT" | "DEBIT";
};

export type OpenInvoice = { id: string; number: string; customer: string; balance: number; currency: string };
export type OpenBill = { id: string; number: string; vendor: string; balance: number; currency: string; what: string | null };
export type EcoCashDay = { day: string; site: string; amount: number };
export type RecordedTransaction = { id: string; date: string; description: string; amount: number; direction: "CREDIT" | "DEBIT" };

export type MatchCandidates = {
  invoices: OpenInvoice[];
  bills: OpenBill[];
  ecocash: EcoCashDay[];
  transactions: RecordedTransaction[];
  /** The bank's name, for "CBZ's monthly charge". */
  bankName: string;
  /** The month a line like this one was last filed under bank charges, `YYYY-MM-DD`. */
  chargesFiledBefore?: (line: StatementLineInput) => string | null;
  /** The workspace's other money accounts in the line's currency: a transfer names one of them. */
  ownAccounts?: Array<{ id: string; name: string; last4: string | null }>;
  /** The IMTT rate on the line's currency, for the reason ("2% of the $1,184.60 paid to ZIMRA"). */
  imttRate?: number;
};

export type Match =
  | { kind: "invoice"; invoiceId: string; amount: number }
  | { kind: "bill"; billId: string; amount: number }
  | { kind: "ecocash"; day: string; amount: number }
  | { kind: "transaction"; transactionId: string }
  | { kind: "bank-charges"; amount: number; imtt?: boolean }
  /** Money moved between two of the workspace's own accounts: a bank entry (transfer) through the core. */
  | { kind: "transfer"; otherAccountId: string; amount: number };

export type Proposal = {
  match: Match;
  /** "INV-0142, Pomona Offices, part payment". */
  title: string;
  /** Where the record lives: "Books" or "Tender". */
  source: string;
  /** Why, in a sentence or two. */
  reason: string;
};

/** "No match", with why. */
export type NoMatch = { match: null; reason: string; suggestion: Proposal | null };

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** The digits an invoice number ends in: "INV-0142" → 142. */
function invoiceDigits(number: string): number | null {
  const found = /(\d+)\s*$/.exec(number);
  return found ? Number(found[1]) : null;
}

/** Every invoice number a bank line's words point at: "inv142", "INV-0142", "invoice 142". */
export function invoiceReferences(text: string): number[] {
  const found = new Set<number>();
  for (const hit of text.matchAll(/\binv(?:oice)?[\s\-#.:no]*0*(\d{1,7})\b/gi)) found.add(Number(hit[1]));
  return [...found];
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4);

const STOP = new Set(["limited", "private", "company", "holdings", "services", "the", "and", "pvt", "ltd", "zimbabwe", "group"]);

/** Whether a line's words name the supplier: their first distinctive word appears in it. */
function namesVendor(text: string, vendor: string): boolean {
  const lineWords = new Set(words(text));
  const vendorWords = words(vendor).filter((word) => !STOP.has(word));
  return vendorWords.length > 0 && lineWords.has(vendorWords[0]);
}

const IMTT_LINE = /\bimtt\b|intermediated money transfer|transfer tax/i;
const BANK_CHARGE = /\b(service fee|bank charges?|ledger fee|monthly fee|account fee|commission|levy|imtt|sms fee|cash withdrawal fee)\b/i;

export function proposeMatch(line: StatementLineInput, candidates: MatchCandidates): Proposal | NoMatch {
  const text = `${line.description} ${line.reference ?? ""}`;

  if (line.direction === "CREDIT") {
    // 1. The reference names the invoice.
    const named = invoiceReferences(text);
    if (named.length > 0) {
      const invoices = candidates.invoices.filter((invoice) => named.includes(invoiceDigits(invoice.number) ?? -1));
      if (invoices.length === 1) {
        const invoice = invoices[0];
        if (line.amount <= invoice.balance + 0.005) {
          const left = Math.round((invoice.balance - line.amount) * 100) / 100;
          return {
            match: { kind: "invoice", invoiceId: invoice.id, amount: line.amount },
            title: `${invoice.number}, ${invoice.customer}, ${left > 0 ? "part payment" : "in full"}`,
            source: "Books",
            reason:
              left > 0
                ? `The reference names the invoice. It leaves ${money(left, invoice.currency)} owing.`
                : "The reference names the invoice. It pays it in full.",
          };
        }
        return {
          match: null,
          reason: `The reference names ${invoice.number}, but only ${money(invoice.balance, invoice.currency)} is owed on it.`,
          suggestion: null,
        };
      }
    }

    // 3. EcoCash pays the tills out the next day.
    if (/ecocash/i.test(text)) {
      const days = candidates.ecocash.filter((day) => daysBetween(day.day, line.date) === 1 && near(day.amount, line.amount));
      if (days.length === 1) {
        const day = days[0];
        return {
          match: { kind: "ecocash", day: day.day, amount: line.amount },
          title: `${day.site}, EcoCash sales on ${shortDay(day.day)}`,
          source: "Tender",
          reason: `EcoCash pays the tills out the next day. ${weekday(day.day)}'s EcoCash sales came to the same amount.`,
        };
      }
    }
  } else {
    // 2. A supplier's one bill for this amount.
    const bills = candidates.bills.filter((bill) => namesVendor(text, bill.vendor) && near(bill.balance, line.amount));
    if (bills.length === 1) {
      const bill = bills[0];
      const theirs = candidates.bills.filter((other) => other.vendor === bill.vendor);
      return {
        match: { kind: "bill", billId: bill.id, amount: line.amount },
        title: bill.what ? `Bill from ${bill.vendor}, ${bill.what}` : `Bill ${bill.number} from ${bill.vendor}`,
        source: "Books",
        reason:
          theirs.length === 1
            ? "Same amount and supplier as the one bill you owe them."
            : `Same amount and supplier as bill ${bill.number}.`,
      };
    }
  }

  // 4. Already in the books.
  const recorded = candidates.transactions.filter(
    (txn) => txn.direction === line.direction && near(txn.amount, line.amount) && Math.abs(daysBetween(txn.date, line.date)) <= 3,
  );
  if (recorded.length === 1) {
    const txn = recorded[0];
    return {
      match: { kind: "transaction", transactionId: txn.id },
      title: txn.description,
      source: "Books",
      reason: `Recorded on ${shortDay(txn.date)} for the same amount.`,
    };
  }
  if (recorded.length > 1) {
    return { match: null, reason: `${recorded.length} recorded transactions are for this amount. Choose the one it is.`, suggestion: null };
  }

  // 5. A transfer between the workspace's own accounts.
  if (/\btransfer|\btrf\b|\bsweep\b/i.test(text) && candidates.ownAccounts?.length) {
    const lineWords = new Set(words(text));
    const digits = text.replace(/\D+/g, " ");
    const named = candidates.ownAccounts.filter((account) => {
      const own = words(account.name).filter((word) => !STOP.has(word) && !["current", "account", "merchant", "cash"].includes(word));
      return (own.length > 0 && own.some((word) => lineWords.has(word))) || (account.last4 !== null && new RegExp(`\\b${account.last4}\\b`).test(digits));
    });
    if (named.length === 1) {
      const other = named[0];
      return {
        match: { kind: "transfer", otherAccountId: other.id, amount: line.amount },
        title: line.direction === "CREDIT" ? `Transfer from ${other.name}` : `Transfer to ${other.name}`,
        source: "Books",
        reason: `The line names ${other.name}, one of your own accounts.`,
      };
    }
  }

  // 6. IMTT goes to its own account (books-final §5.8.3), proposed as a bank entry; the bank's own charge.
  if (line.direction === "DEBIT" && IMTT_LINE.test(text)) {
    const rate = candidates.imttRate ?? 0.02;
    const on = candidates.transactions.find((txn) => txn.direction === "DEBIT" && Math.abs(daysBetween(txn.date, line.date)) <= 2 && near(Math.round(txn.amount * rate * 100) / 100, line.amount));
    return {
      match: { kind: "bank-charges", amount: line.amount, imtt: true },
      title: "Bank entry: IMTT, to 5465",
      source: "Books",
      reason: on ? `${Math.round(rate * 1000) / 10}% of the ${money(on.amount)} paid on ${shortDay(on.date)}` : `It reads like the IMTT ${candidates.bankName} took on a transfer.`,
    };
  }
  if (line.direction === "DEBIT" && BANK_CHARGE.test(text)) {
    const before = candidates.chargesFiledBefore?.(line) ?? null;
    return {
      match: null,
      reason: before
        ? `No invoice or bill matches. It looks like ${candidates.bankName}'s monthly charge, which you filed under bank charges in ${monthName(before)}.`
        : `No invoice or bill matches. It looks like ${candidates.bankName}'s own charge.`,
      suggestion: {
        match: { kind: "bank-charges", amount: line.amount },
        title: "Bank charges",
        source: "Books",
        reason: "Filed under bank charges.",
      },
    };
  }

  return {
    match: null,
    reason:
      line.direction === "CREDIT"
        ? "No open invoice or recorded payment matches. Choose what it was."
        : "No bill or recorded payment matches. Choose what it was.",
    suggestion: null,
  };
}

export function isProposal(result: Proposal | NoMatch): result is Proposal {
  return result.match !== null;
}
