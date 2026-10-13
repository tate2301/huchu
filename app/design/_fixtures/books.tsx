import type { IconName } from "@/components/core";

import type { PanelGroup, PanelRow } from "./shell";

/** Books' panel as the boards draw it (design/core-modules/html/books-*.html), with one row on. */
export function booksPanel(on: "Money" | "Invoices" | "Bank"): { rows: PanelRow[]; groups: PanelGroup[] } {
  const row = (label: string, icon: IconName, count?: number): PanelRow => ({
    label,
    icon,
    count,
    on: label === on,
  });
  return {
    rows: [
      row("Money", "overview"),
      row("Invoices", "invoice", 3),
      row("Payments", "payments"),
      row("Takings", "takings", 1),
      row("Expenses", "expenses"),
      row("Bank", "bank", 4),
      row("VAT", "vat"),
    ],
    groups: [
      {
        title: "Saved views",
        add: true,
        rows: [
          { label: "Overdue", dot: true, meta: "shared" },
          { label: "Pomona Offices", dot: true, meta: "you" },
          { label: "Paid this month", dot: true, meta: "shared" },
        ],
      },
      {
        title: "Reports from Books",
        rows: [
          { label: "Money this month", icon: "reports" },
          { label: "Owed to you, by age", icon: "reports" },
        ],
      },
    ],
  };
}
