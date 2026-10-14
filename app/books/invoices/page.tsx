"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { InvoicesPageView } from "@/components/books/invoices-view";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { InvoiceQuery, InvoicesView } from "@/lib/books/invoices";
import type { ReminderOutcome } from "@/lib/books/reminders";

const NEW_INVOICE = { label: "New invoice", icon: "plus" as const, href: "/accounting/sales?action=new-invoice" };

/** Books → Invoices (design/core-modules/html/books-invoices.html). The list's filters live in the address. */
function BooksInvoices() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const search = params.toString();

  const invoices = useQuery({
    queryKey: ["books", "invoices", search],
    queryFn: () => fetchJson<InvoicesView>(`/api/books/invoices${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });

  const onQuery = React.useCallback(
    (next: Partial<InvoiceQuery>) => {
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

  const remind = useMutation({
    mutationFn: (invoiceIds: string[]) =>
      fetchJson<ReminderOutcome>("/api/books/invoices/reminders", { method: "POST", body: JSON.stringify({ invoiceIds }) }),
    onSuccess: (outcome) => {
      const sent = outcome.sent.length;
      // One line per reason: "WhatsApp is not connected (10 invoices)", "Mrs Gumbo has no phone number (INV-0150)".
      const byWhy = new Map<string, string[]>();
      for (const row of outcome.skipped) byWhy.set(row.why, [...(byWhy.get(row.why) ?? []), row.invoice]);
      const skipped = [...byWhy.entries()]
        .map(([why, numbers]) => `${why.charAt(0).toUpperCase()}${why.slice(1)} (${numbers.length > 2 ? `${numbers.length} invoices` : numbers.join(", ")})`)
        .join(". ");
      toast({
        title: sent === 0 ? "No reminder went" : sent === 1 ? "1 reminder sent on WhatsApp" : `${sent} reminders sent on WhatsApp`,
        description: skipped ? `${skipped}.` : undefined,
        variant: sent === 0 ? "destructive" : undefined,
      });
    },
    onError: (error) => toast({ title: "The reminders did not go", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  return (
    <>
      <PageChrome title="Invoices" primary={NEW_INVOICE} />
      <BooksPage screen="books-invoices">
        {invoices.data ? (
          <InvoicesPageView
            data={invoices.data}
            onQuery={onQuery}
            sending={remind.isPending}
            onSendReminders={(rows) => remind.mutate(rows.map((row) => row.id))}
            onPrintStatements={(rows) => {
              const customers = [...new Set(rows.map((row) => row.customer.id))];
              window.open(`/books/statements?customers=${customers.join(",")}`, "_blank", "noopener");
            }}
            exportHref={`/api/books/invoices?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
          />
        ) : invoices.isError ? (
          <BooksError what="Invoices" onRetry={() => invoices.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
    </>
  );
}

export default function BooksInvoicesPage() {
  // The filters are read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<BooksPage screen="books-invoices"><BooksLoading /></BooksPage>}>
      <BooksInvoices />
    </React.Suspense>
  );
}
