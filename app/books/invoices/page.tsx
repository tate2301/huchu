"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { downloadCsv } from "@/components/books/bk-list";
import { BkInvoicesView, type InvoiceBulk } from "@/components/books/bk-invoices-view";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { useBulkUndo } from "@/components/books/undo-dialogs";
import { ButtonLink, Kit } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { InvoiceQuery, InvoicesView } from "@/lib/books/invoices";
import type { ReminderOutcome } from "@/lib/books/reminders";

const NEW_INVOICE = { label: "New invoice", icon: "plus" as const, href: "/books/invoices/new", shortcut: "N" };

type Listed = InvoicesView & { can: { deleteDrafts: boolean; issue: boolean; owner: boolean } };

/** One sentence per outcome of a run over the selection: "2 issued. INV-0150 was not: it was issued already." */
function outcome(done: string[], verb: string, failed: Array<{ number: string; why: string }>): string {
  const parts = [done.length === 1 ? `1 ${verb}.` : `${done.length} ${verb}.`];
  for (const row of failed.slice(0, 3)) parts.push(`${row.number}: ${row.why}`);
  if (failed.length > 3) parts.push(`${failed.length - 3} more were not.`);
  return parts.join(" ");
}

/** Books → Sales → Invoices (design/core-modules/boards/view/BkInvoices.html, BkInvoicesBulk). The list's filters live in the address. */
function BooksInvoices() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const client = useQueryClient();
  const search = params.toString();

  const invoices = useQuery({
    queryKey: ["books", "invoices", search],
    queryFn: () => fetchJson<Listed>(`/api/books/invoices${search ? `?${search}` : ""}`),
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
    mutationFn: (invoiceIds: string[]) => fetchJson<ReminderOutcome>("/api/books/invoices/reminders", { method: "POST", body: JSON.stringify({ invoiceIds }) }),
    onSuccess: (result) => {
      const sent = result.sent.length;
      const byWhy = new Map<string, string[]>();
      for (const row of result.skipped) byWhy.set(row.why, [...(byWhy.get(row.why) ?? []), row.invoice]);
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

  // Issue and Delete drafts over the selection, one row at a time through the routes a draft has.
  const run = useMutation({
    mutationFn: async ({ rows, action }: { rows: Listed["rows"]; action: "issue" | "delete" }) => {
      const done: string[] = [];
      const failed: Array<{ number: string; why: string }> = [];
      for (const row of rows) {
        try {
          if (action === "issue") {
            const issued = await fetchJson<{ number: string }>(`/api/books/invoices/${row.id}/issue`, { method: "POST", body: JSON.stringify({ asMine: false }) });
            done.push(issued.number);
          } else {
            await fetchJson(`/api/books/invoices/${row.id}`, { method: "DELETE", body: JSON.stringify({}) });
            done.push(row.number);
          }
        } catch (error) {
          failed.push({ number: row.number, why: getApiErrorMessage(error, "it did not go through.") });
        }
      }
      return { done, failed, action };
    },
    onSuccess: async ({ done, failed, action }) => {
      toast({
        title: action === "issue" ? (done.length === 1 ? `${done[0]} is issued` : `${done.length} drafts issued`) : done.length === 1 ? "1 draft deleted" : `${done.length} drafts deleted`,
        description: outcome(done, action === "issue" ? "issued" : "deleted", failed),
        variant: failed.length && !done.length ? "destructive" : "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const bulk: InvoiceBulk = {
    remind: (rows) => remind.mutate(rows.map((row) => row.id)),
    statements: (rows) => {
      const customers = [...new Set(rows.map((row) => row.customer.id))];
      window.open(`/books/statements?customers=${customers.join(",")}`, "_blank", "noopener");
    },
    issue: (rows) => run.mutate({ rows, action: "issue" }),
    exportRows: (rows) =>
      downloadCsv(
        "invoices.csv",
        ["Invoice", "Customer", "State", "When", "Currency", "Total", "Balance"],
        rows.map((row) => [row.number, row.customer.name, row.stateLabel, row.when, row.currency, row.total.toFixed(2), row.balance.toFixed(2)]),
      ),
    deleteDrafts: (rows) => run.mutate({ rows, action: "delete" }),
  };

  // Void and Delete permanently over the selection (P4): offered as this person's role allows; the result row by row.
  const undo = useBulkUndo("invoice", () => client.invalidateQueries({ queryKey: ["books"] }));
  const undoEntries = (rows: Listed["rows"]) =>
    undo.entries(rows.map((row) => ({ id: row.id, label: row.number, posted: row.state !== "draft", party: row.customer.name, amount: money(row.total, row.currency) })));

  const data = invoices.data;
  return (
    <>
      <PageChrome title="Invoices" primary={NEW_INVOICE}>
        <Kit contents>
          <ButtonLink href={`/books/statements${data?.query.customer ? `?customers=${data.query.customer}` : ""}`} icon="print">
            Statements
          </ButtonLink>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-a">
        {data ? (
          <BkInvoicesView
            data={data}
            onQuery={onQuery}
            exportHref={`/api/books/invoices?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
            bulk={bulk}
            busy={remind.isPending || run.isPending}
            canIssue={data.can.issue}
            canDeleteDrafts={data.can.deleteDrafts}
            undoEntries={undoEntries}
          />
        ) : invoices.isError ? (
          <BooksError what="Invoices" onRetry={() => invoices.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {undo.node}
    </>
  );
}

export default function BooksInvoicesPage() {
  // The filters are read from the address, which is only known in the browser.
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksInvoices />
    </React.Suspense>
  );
}
