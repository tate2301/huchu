"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { InvoiceDeleteDialog, type InvoiceDeleted } from "@/components/books/invoice-actions";
import { ExploreThisList, ListVane } from "@/components/explore/list-vane";
import { canUseExplore } from "@/lib/explore/roles";
import { useSession } from "next-auth/react";
import { InvoicesPageView } from "@/components/books/invoices-view";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { InvoiceQuery, InvoiceRow, InvoicesView } from "@/lib/books/invoices";
import type { ReminderOutcome } from "@/lib/books/reminders";

const NEW_INVOICE = { label: "New invoice", icon: "plus" as const, href: "/accounting/sales?action=new-invoice" };

/** The list as a question (Explore this list): what is still owed, from the report Books → Invoices feeds. */
const INVOICES_QUESTION = `select invoice, customer, due, days_late, currency, balance
from books_owed_by_age
order by days_late desc;`;

/** The same question over Books' own tables, when Explore reads them through its own login. */
const INVOICES_TABLES_QUESTION = `select i.invoice_number as invoice, c.name as customer, i.due_date as due,
  current_date - i.due_date::date as days_late, i.currency,
  i.total - i.amount_paid - i.credit_total - i.write_off_total as balance
from sales_invoice i
left join customer c on c.id = i.customer_id
where i.status = 'ISSUED'
  and i.total - i.amount_paid - i.credit_total - i.write_off_total > 0
order by days_late desc;`;

/** Books → Invoices (design/core-modules/html/books-invoices.html). The list's filters live in the address. */
function BooksInvoices() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const search = params.toString();
  const [deleting, setDeleting] = React.useState<{ id: string; number: string } | null>(null);

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

  // A row's menu: Delete for a draft (whoever may change drafts); Reverse and Delete for the rest (the owner only).
  const can = invoices.data?.can;
  const rowMenu = React.useCallback(
    (row: InvoiceRow) => {
      const remove = { key: "delete", icon: "x" as const, danger: true, label: row.state === "draft" ? "Delete the draft" : "Delete", onSelect: () => setDeleting({ id: row.id, number: row.number }) };
      if (row.state === "draft") return can?.deleteDrafts ? [remove] : null;
      if (!can?.owner) return null;
      if (row.state === "void") return [remove];
      return [{ key: "reverse", icon: "back" as const, label: "Reverse", onSelect: () => router.push(`/books/invoices/${row.id}?reverse=1`) }, remove];
    },
    [can?.deleteDrafts, can?.owner, router],
  );

  const deleted = async (done: InvoiceDeleted) => {
    const kept = done.onAccount.map((receipt) => receipt.number);
    toast({
      title: `${done.deleted} is deleted`,
      description: kept.length ? `${kept.join(", ")} ${kept.length === 1 ? "stays" : "stay"} as the customer's money on account.` : undefined,
      variant: "success",
    });
    await queryClient.invalidateQueries({ queryKey: ["books", "invoices"] });
  };

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
            explore={canUseExplore(session?.user?.role) ? <ExploreThisList sql={INVOICES_QUESTION} tablesSql={INVOICES_TABLES_QUESTION} title="Invoices still owed" /> : null}
            vane={<ListVane path="/books/invoices" />}
            rowMenu={rowMenu}
          />
        ) : invoices.isError ? (
          <BooksError what="Invoices" onRetry={() => invoices.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {deleting ? (
        <InvoiceDeleteDialog
          invoiceId={deleting.id}
          number={deleting.number}
          open
          onOpenChange={(open) => (open ? undefined : setDeleting(null))}
          onDeleted={deleted}
        />
      ) : null}
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
