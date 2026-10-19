import { z } from "zod";

import type { AgeBucket } from "./invoices";

/** Books → Sales → Customers (BkCustomers, BkCustomer): the shapes the pages render. No database here. */

export const CUSTOMER_VIEWS = ["all", "owing", "by-age", "on-account"] as const;
export type CustomerTab = (typeof CUSTOMER_VIEWS)[number];

export const CUSTOMER_TAB_LABEL: Record<CustomerTab, string> = { all: "All", owing: "Owing", "by-age": "By age", "on-account": "On account" };

export const customerQuerySchema = z.object({
  view: z.enum(CUSTOMER_VIEWS).catch("all"),
  q: z.string().trim().max(100).catch(""),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/).nullable().catch(null),
  vat: z.enum(["any", "yes", "no"]).catch("any"),
  sort: z.enum(["name", "owes"]).catch("name"),
  page: z.coerce.number().int().min(1).catch(1),
});
export type CustomerQuery = z.infer<typeof customerQuerySchema>;

export function readCustomerQuery(params: URLSearchParams): CustomerQuery {
  return customerQuerySchema.parse({
    view: params.get("view") ?? undefined,
    q: params.get("q") ?? undefined,
    currency: params.get("currency") || null,
    vat: params.get("vat") ?? undefined,
    sort: params.get("sort") ?? undefined,
    page: params.get("page") ?? undefined,
  });
}

export type CustomerRow = {
  id: string;
  name: string;
  contact: string | null;
  owes: number;
  overdue: number;
  onAccount: number;
  lastPaid: string | null;
  ages: Record<AgeBucket, number>;
};

export type CustomersView = {
  finding: { fact: string; rest: string | null };
  rows: CustomerRow[];
  range: { from: number; to: number; of: number };
  counts: Record<CustomerTab, number>;
  totals: { owed: number; overdue: number; onAccount: number };
  currency: string;
  currencies: string[];
  query: CustomerQuery;
};

export type StatementLine = { date: string; document: string; detail: string; href: string | null; invoiced: number | null; paid: number | null; balance: number };

export type CustomerPage = {
  id: string;
  name: string;
  /** At most two items: the accounts contact and how long they have been a customer. */
  line: string[];
  contact: { phone: string | null; email: string | null; address: string | null };
  tax: { vatNumber: string | null; tin: string | null };
  /** Their usual terms, from the invoices they have had. */
  terms: string | null;
  currency: string;
  tiles: { owes: number; nextDue: string | null; overdue: number; paidYear: number; paymentsYear: number };
  onAccount: number;
  invoices: Array<{ id: string; number: string; date: string; status: string; total: number; balance: number; currency: string }>;
  payments: Array<{ id: string; number: string; date: string; forWhat: string; invoiceId: string | null; into: string; amount: number; currency: string; voided: boolean }>;
  statement: { from: string; to: string; lines: StatementLine[]; opening: number; closing: number; invoiced: number; paid: number };
};

export type CustomerView = CustomerPage & { ages: Record<AgeBucket, number> };
