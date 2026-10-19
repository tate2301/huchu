"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { ExpensesPageView } from "@/components/books/expenses-view";
import { ButtonLink, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { ExpenseQuery, ExpensesView } from "@/lib/books/expenses";

/** New bill opens Payables' own form, as Record a payment does from Money. */
/** Books' own form (BkBillNew); Pay a supplier sits beside it in Record. */
const NEW_BILL = { label: "New bill", icon: "plus" as const, href: "/books/bills/new", shortcut: "N" };

/** Books → Expenses: the bills suppliers sent, from Payables. The list's filters live in the address. */
function BooksExpenses() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();

  const expenses = useQuery({
    queryKey: ["books", "expenses", search],
    queryFn: () => fetchJson<ExpensesView>(`/api/books/expenses${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const onQuery = React.useCallback(
    (next: Partial<ExpenseQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty = value === null || value === "" || (key === "view" && value === "all") || (key === "period" && value === "any") || (key === "sort" && value === "newest") || (key === "page" && value === 1);
        if (empty) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <>
      <PageChrome title="All spending" primary={NEW_BILL}>
        <Kit contents>
          <ButtonLink href="/books/payments-made/new" icon="payments">
            Pay a supplier
          </ButtonLink>
        </Kit>
      </PageChrome>
      <BooksPage screen="books-invoices">
        {expenses.data ? (
          <ExpensesPageView
            data={expenses.data}
            onQuery={onQuery}
            exportHref={`/api/books/expenses?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
          />
        ) : expenses.isError ? (
          <BooksError what="Expenses" onRetry={() => expenses.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

export default function BooksExpensesPage() {
  // The filters are read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<BooksPage screen="books-invoices"><BooksLoading /></BooksPage>}>
      <BooksExpenses />
    </React.Suspense>
  );
}
