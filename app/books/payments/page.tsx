"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { PaymentsPageView } from "@/components/books/payments-view";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import type { PaymentQuery, PaymentsView } from "@/lib/books/payments";

/** Add a receipt opens Receivables' own form, as it does from Money. */
const ADD_RECEIPT = { label: "Add a receipt", icon: "plus" as const, href: "/accounting/sales?action=new-receipt" };

/** Books → Payments: what customers paid, from Receivables' receipts. The list's filters live in the address. */
function BooksPayments() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();

  const payments = useQuery({
    queryKey: ["books", "payments", search],
    queryFn: () => fetchJson<PaymentsView>(`/api/books/payments${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const onQuery = React.useCallback(
    (next: Partial<PaymentQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        const empty = value === "" || (key === "view" && value === "all") || (key === "period" && value === "any") || (key === "sort" && value === "newest") || (key === "page" && value === 1);
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
      <PageChrome title="Payments" primary={ADD_RECEIPT} />
      <BooksPage screen="books-invoices">
        {payments.data ? (
          <PaymentsPageView
            data={payments.data}
            onQuery={onQuery}
            exportHref={`/api/books/payments?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
          />
        ) : payments.isError ? (
          <BooksError what="Payments" onRetry={() => payments.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

export default function BooksPaymentsPage() {
  // The filters are read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<BooksPage screen="books-invoices"><BooksLoading /></BooksPage>}>
      <BooksPayments />
    </React.Suspense>
  );
}
