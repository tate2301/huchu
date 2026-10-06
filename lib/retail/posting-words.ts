import type { AccountType, RetailAccountRole, RetailPostingSchedule } from "@prisma/client";

import { formatDay, formatTime } from "@/lib/workspace/format";

/**
 * Posting to the books in words (SET-09, board PostingSettings). Browser-safe:
 * the page, its settings store and the posting run share it.
 */

/** "Sales and stock": each role's label, in the board's order (C-10: a unit that adds a role adds its label). */
export const ROLE_OPTIONS: ReadonlyArray<{ role: RetailAccountRole; field: string; label: string }> = [
  { role: "SALES", field: "sales", label: "Sales" },
  { role: "VAT_OUTPUT", field: "vat", label: "VAT" },
  { role: "COST_OF_SALES", field: "costOfSales", label: "Cost of sales" },
  { role: "STOCK", field: "stock", label: "Stock" },
  { role: "BREAKAGE", field: "breakage", label: "Breakage and losses" },
  { role: "DEPOSITS_HELD", field: "deposits", label: "Deposits on empties" },
];

/** The account types each role posts to sensibly (10-setup W-65). */
export const ROLE_TYPES: Record<RetailAccountRole, AccountType[]> = {
  SALES: ["INCOME"],
  VAT_OUTPUT: ["LIABILITY"],
  COST_OF_SALES: ["EXPENSE"],
  STOCK: ["ASSET"],
  BREAKAGE: ["EXPENSE"],
  DEPOSITS_HELD: ["LIABILITY"],
};

/** A tender settles into an asset (cash, a bank, a debtor), or for vouchers what the shop owes. */
export const TENDER_TYPES: AccountType[] = ["ASSET"];
export const VOUCHER_TYPES: AccountType[] = ["ASSET", "LIABILITY"];

export const TYPE_WORDS: Record<AccountType, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
};

/** "an asset account", "an income account". */
export function typeWithArticle(type: AccountType): string {
  const word = TYPE_WORDS[type].toLowerCase();
  return `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
}

/** "1010 Cash on hand, US$": an account as every account field lists it. */
export function accountLabel(account: { code: string; name: string }): string {
  return `${account.code} ${account.name}`;
}

/** "4000 Retail Sales Revenue is an income account. Sales needs an expense account." */
export function wrongTypeProblem(
  account: { code: string; name: string; type: AccountType },
  field: string,
  allowed: AccountType[],
): string {
  const wanted = allowed.map((type) => typeWithArticle(type)).join(" or ");
  return `${accountLabel(account)} is ${typeWithArticle(account.type)} account. ${field} needs ${wanted} account.`;
}

export const SCHEDULE_WORDS: Record<RetailPostingSchedule, string> = {
  END_OF_DAY: "At the end of each day",
  EVERY_SALE: "With every sale",
};

export function scheduleOf(words: string): RetailPostingSchedule | null {
  return (Object.keys(SCHEDULE_WORDS) as RetailPostingSchedule[]).find((key) => SCHEDULE_WORDS[key] === words) ?? null;
}

const QUICK_TYPES: Record<string, AccountType> = {
  asset: "ASSET",
  liability: "LIABILITY",
  income: "INCOME",
  expense: "EXPENSE",
};

/**
 * A quick add's two fields read: "1012 Cash on hand, rand" and "Asset". The
 * leading digits are the code; the rest is the name. One sentence per field
 * that does not read.
 */
export function parseQuickAccount(
  codeAndName: string,
  type: string,
): { ok: true; code: string; name: string; type: AccountType } | { ok: false; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  const match = /^\s*(\d{3,6})[\s.\-–:]+(.*\S)\s*$/.exec(codeAndName);
  if (!codeAndName.trim()) fieldErrors.codeAndName = "Type the account’s code and name, like 1012 Cash on hand, rand.";
  else if (!match) fieldErrors.codeAndName = "Start with the account’s code, then its name: 1012 Cash on hand, rand.";
  else if (match[2]!.length > 80) fieldErrors.codeAndName = "Keep the name to 80 characters.";
  const accountType = QUICK_TYPES[type.trim().toLowerCase()];
  if (!accountType) fieldErrors.type = "Asset, liability, income or expense.";
  if (Object.keys(fieldErrors).length > 0 || !match || !accountType) return { ok: false, fieldErrors };
  return { ok: true, code: match[1]!, name: match[2]!, type: accountType };
}

export type RunCounts = { sales: number; refunds: number; deliveries: number; counts: number };

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "412 sales, 6 deliveries, 1 count": the parts with something in them. */
export function runParts(counts: RunCounts): string {
  return [
    counts.sales ? count(counts.sales, "sale", "sales") : null,
    counts.refunds ? count(counts.refunds, "refund", "refunds") : null,
    counts.deliveries ? count(counts.deliveries, "delivery", "deliveries") : null,
    counts.counts ? count(counts.counts, "count", "counts") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** "Last posted": "2 October, 23:00. 412 sales, 6 deliveries, 1 count." — never: "Not yet." */
export function lastPostedWords(
  run: (RunCounts & { at: string | Date; other?: number; failed: number }) | null,
  now: Date,
): string {
  if (!run) return "Not yet.";
  const at = new Date(run.at);
  const day = formatDay(at);
  const year = formatDay(now).split(" ").pop()!;
  const shown = day.endsWith(` ${year}`) ? day.slice(0, -(year.length + 1)) : day;
  const parts = runParts(run);
  const failed = run.failed ? `${count(run.failed, "item", "items")} could not post.` : "";
  const what = parts
    ? `${parts}.`
    : run.other
      ? `${count(run.other, "other entry", "other entries")}.`
      : failed
        ? ""
        : "Nothing was waiting.";
  return [`${shown}, ${formatTime(at)}.`, what, failed].filter(Boolean).join(" ");
}

/** The toast after "Post now": "Posted 1 sale." */
export function postedToast(counts: RunCounts & { failed: number; other: number }): string {
  const parts = runParts(counts);
  const failed = counts.failed ? `${count(counts.failed, "item", "items")} could not post.` : "";
  const posted = parts ? `Posted ${parts}.` : counts.other ? "Posted." : failed ? "" : "Nothing was waiting to post.";
  return [posted, failed].filter(Boolean).join(" ");
}

/** "Ready to post", when something could not post: "3 items could not post. Post now tries them again." */
export function failedWords(failed: number): string {
  return `${count(failed, "item", "items")} could not post. Post now tries ${failed === 1 ? "it" : "them"} again.`;
}
