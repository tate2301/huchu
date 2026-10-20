/**
 * An old address forwarding to where its page moved, with its query intact:
 * `/accounting/journals?journal=…` opens `/books/journals?journal=…`.
 */
export function movedTo(path: string, searchParams: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) for (const one of value) query.append(key, one);
    else if (value !== undefined) query.append(key, value);
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}

type Query = Record<string, string | string[] | undefined>;

const SALES_VIEWS: Record<string, string> = {
  invoices: "/books/invoices",
  customers: "/books/customers",
  receipts: "/books/payments",
  "credit-notes": "/books/credit-notes",
  "write-offs": "/books/credit-notes?view=write-offs",
  aging: "/books/customers?view=by-age",
  "ar-aging": "/books/customers?view=by-age",
  statements: "/books/statements",
};

const SALES_ACTIONS: Record<string, string> = {
  "new-invoice": "/books/invoices/new",
  "new-receipt": "/books/payments/new",
  "new-customer": "/books/customers?action=new-customer",
  "new-credit-note": "/books/credit-notes?action=new-credit-note",
  "new-write-off": "/books/credit-notes?action=new-write-off",
};

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Where `?view=` or `?action=` sent a person, with the rest of the query kept (books-final §3.4). */
function mapped(target: string, rest: Query): string {
  const [path, own] = target.split("?");
  const merged: Query = { ...Object.fromEntries(new URLSearchParams(own ?? "")), ...rest };
  return movedTo(path, merged);
}

/** `/accounting/sales` → the Books Sales page its view or action names; Invoices when it names none. */
export function salesMovedTo(searchParams: Query): string {
  const { view, action, ...rest } = searchParams;
  const byAction = SALES_ACTIONS[first(action) ?? ""];
  if (byAction) return mapped(byAction, rest);
  return mapped(SALES_VIEWS[first(view) ?? ""] ?? "/books/invoices", rest);
}

/** `/accounting/receivables` → Customers by age: the hub's tiles are Money's. */
export function receivablesMovedTo(searchParams: Query): string {
  const rest = { ...searchParams };
  delete rest.view;
  return mapped("/books/customers?view=by-age", rest);
}

const PURCHASE_VIEWS: Record<string, string> = {
  bills: "/books/bills",
  vendors: "/books/suppliers",
  suppliers: "/books/suppliers",
  payments: "/books/payments-made",
  "debit-notes": "/books/bills?view=debit-notes",
  "write-offs": "/books/suppliers?view=write-offs",
  aging: "/books/suppliers?view=by-age",
  "ap-aging": "/books/suppliers?view=by-age",
  statements: "/books/suppliers",
};

const PURCHASE_ACTIONS: Record<string, string> = {
  "new-bill": "/books/bills/new",
  "new-payment": "/books/payments-made/new",
  "new-vendor": "/books/suppliers?action=new-vendor",
  // A debit note and a write-off are made from their bill's page: Bills opens on the bills to choose from.
  "new-debit-note": "/books/bills?action=new-debit-note",
  "new-write-off": "/books/bills?action=new-write-off",
};

/**
 * `/accounting/purchases` → the Books Bills & spending page its view or action
 * names; Bills when it names none (books-final §3.4). A statement for one
 * supplier (`vendorId`) opens their Statement tab.
 */
export function purchasesMovedTo(searchParams: Query): string {
  const { view, action, ...rest } = searchParams;
  const byAction = PURCHASE_ACTIONS[first(action) ?? ""];
  if (byAction) return mapped(byAction, rest);
  const vendor = first(rest.vendorId) ?? first(rest.vendor);
  if (first(view) === "statements" && vendor && /^[0-9a-f-]{36}$/i.test(vendor)) {
    const others = { ...rest };
    delete others.vendorId;
    delete others.vendor;
    return mapped(`/books/suppliers/${vendor}?tab=statement`, others);
  }
  return mapped(PURCHASE_VIEWS[first(view) ?? ""] ?? "/books/bills", rest);
}

/** `/accounting/payables` → Suppliers by age: the hub's tiles are Money's. */
export function payablesMovedTo(searchParams: Query): string {
  const rest = { ...searchParams };
  delete rest.view;
  return mapped("/books/suppliers?view=by-age", rest);
}

// ── P3: Bank & cash, Tax, Close the month, Settings (books-final §3.4) ──────────

/**
 * `/accounting/banking` → Bank & cash: its accounts tab to Accounts, its
 * transactions to Accounts too (each account lists them), its reconciliations
 * to Reconciliations. New accounts are set up in Management's Money accounts.
 */
export function bankingMovedTo(searchParams: Query): string {
  const { view, tab, ...rest } = searchParams;
  const which = first(view) ?? first(tab);
  if (which === "reconciliations") return mapped("/books/reconciliations", rest);
  const account = first(rest.accountId) ?? first(rest.account);
  if (account && /^[0-9a-f-]{36}$/i.test(account)) {
    const others = { ...rest };
    delete others.accountId;
    delete others.account;
    return mapped(`/books/accounts/${account}`, others);
  }
  return mapped("/books/accounts", rest);
}

/** `/accounting/currency` → Rates & revaluation. */
export function currencyMovedTo(searchParams: Query): string {
  const { view, ...rest } = searchParams;
  return mapped(first(view) === "revaluation" ? "/books/rates?tab=revaluation" : "/books/rates", rest);
}

/** `/accounting/fiscalisation` → the Fiscal register; the device itself is set up in Management (Shop › Fiscal device). */
export function fiscalisationMovedTo(searchParams: Query): string {
  const { view, tab, ...rest } = searchParams;
  const which = first(view) ?? first(tab);
  if (which === "config" || which === "setup" || which === "device") return "/retail/manage/fiscal";
  return mapped(which === "days" || which === "fiscal-days" ? "/books/fiscal?tab=days" : which === "failed" ? "/books/fiscal?tab=failed" : "/books/fiscal", rest);
}

const TAX_VIEWS: Record<string, string> = {
  codes: "/books/settings/tax",
  categories: "/books/settings/tax?tab=categories",
  templates: "/books/settings/tax?tab=templates",
  rules: "/books/settings/tax?tab=rules",
  "vat-summary": "/books/vat",
};

/** `/accounting/tax/setup` → Settings › Tax codes & rules, on the view it named; the VAT summary is the VAT return. */
export function taxSetupMovedTo(searchParams: Query): string {
  const { view, ...rest } = searchParams;
  return mapped(TAX_VIEWS[first(view) ?? ""] ?? "/books/settings/tax", rest);
}

// ── P5: the Ledger and Settings levels (books-final §3.4) ──────────────────────

const FINANCIAL_TABS: Record<string, string> = {
  profit: "pl",
  pl: "pl",
  "profit-and-loss": "pl",
  income: "pl",
  balance: "bs",
  bs: "bs",
  "balance-sheet": "bs",
  "cash-flow": "cf",
  cf: "cf",
};

/** `/accounting/financial-statements` and `/accounting/financial-reports` → Financial statements, on the statement they named. */
export function financialsMovedTo(searchParams: Query): string {
  const { view, tab, ...rest } = searchParams;
  const which = FINANCIAL_TABS[first(view) ?? first(tab) ?? ""];
  return mapped(which && which !== "pl" ? `/books/financials?tab=${which}` : "/books/financials", rest);
}

/** `/accounting/trial-balance` → Trial balance; a date range stays a range. */
export function trialBalanceMovedTo(searchParams: Query): string {
  const { startDate, endDate, periodId, ...rest } = searchParams;
  void periodId;
  const from = first(startDate)?.slice(0, 10);
  const to = first(endDate)?.slice(0, 10);
  if (from || to) return mapped(`/books/trial-balance?view=range${from ? `&from=${from}` : ""}${to ? `&to=${to}` : ""}`, rest);
  return mapped("/books/trial-balance", rest);
}

/** `/accounting/chart-of-accounts` → Chart of accounts; `?action=new-account` opens New account there. */
export function chartMovedTo(searchParams: Query): string {
  return movedTo("/books/chart", searchParams);
}

/** `/accounting/cost-centers` → Cost centres. */
export function costCentresMovedTo(searchParams: Query): string {
  return movedTo("/books/cost-centres", searchParams);
}

const POSTING_VIEWS: Record<string, string> = {
  "rule-library": "/books/posting-rules",
  simulation: "/books/posting-rules",
  "retail-defaults": "/books/posting-rules?tab=tenders",
  failures: "/books/needs-posting",
  seed: "/books/settings/setup",
  readiness: "/books/posting-rules?tab=readiness",
};

/** `/accounting/posting-rules` → Posting rules; its failures are Needs posting and its seed is Set up the books. */
export function postingRulesMovedTo(searchParams: Query): string {
  const { view, ...rest } = searchParams;
  return mapped(POSTING_VIEWS[first(view) ?? ""] ?? "/books/posting-rules", rest);
}
