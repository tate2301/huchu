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
