import type { ReportDefinition } from "@/lib/reports/types";

/**
 * Books' own reports (design/core-modules, BooksMoney's "Reports from Books"):
 * read from what Books reads, never a copy of it. Each is about a Books page,
 * so it is listed in Books' panel and gated the way that page is.
 */

const money: ReportDefinition = {
  key: "books-money-month",
  title: "Money this month",
  area: "Books",
  href: "/books",
  profiles: [],
  summary: "Money in and out this month, by where it came from and went",
  params: [],
  columns: [
    { key: "source", label: "Source", kind: "text" },
    { key: "direction", label: "In or out", kind: "status" },
    { key: "detail", label: "What it is", kind: "text" },
    { key: "count", label: "How many", kind: "number", total: "sum" },
    { key: "amount", label: "Amount", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "amount", dir: "desc" }] },
};

const owed: ReportDefinition = {
  key: "books-owed-by-age",
  title: "Owed to you, by age",
  area: "Books",
  href: "/books/invoices",
  profiles: [],
  summary: "Invoices with money owing, by how late they are",
  params: [],
  columns: [
    { key: "bucket", label: "Age", kind: "status" },
    { key: "invoice", label: "Invoice", kind: "code" },
    { key: "customer", label: "Customer", kind: "text" },
    { key: "due", label: "Due", kind: "date" },
    { key: "daysLate", label: "Days late", kind: "number" },
    { key: "currency", label: "Currency", kind: "code", hidden: true },
    { key: "balance", label: "Owing", kind: "money", total: "sum" },
  ],
  defaults: { sort: [{ column: "daysLate", dir: "desc" }], groupBy: "bucket" },
};

export const BOOKS_REPORTS: readonly ReportDefinition[] = [money, owed];
