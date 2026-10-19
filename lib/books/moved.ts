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
