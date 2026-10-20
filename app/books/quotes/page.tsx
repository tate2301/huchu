"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BkChip, BkTabs, BkTools, downloadCsv } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksFinding, BooksPage } from "@/components/books/figures";
import { useBulkUndo } from "@/components/books/undo-dialogs";
import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import { QUOTE_TAB_LABEL, QUOTE_VIEWS, type QuoteQuery, type QuotesView } from "@/lib/books/quotes-view";

type Listed = QuotesView & { crm: boolean };

/**
 * Books → Sales → Quotes (design/core-modules/boards/view/BkQuotes.html): the
 * CRM's quotations, the same rows its quote screen shows. A quote is raised
 * from a deal; one that was accepted is made into an invoice here.
 */
function BooksQuotes() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const quotes = useQuery({
    queryKey: ["books", "quotes", search],
    queryFn: () => fetchJson<Listed>(`/api/books/quotes${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const data = quotes.data;
  const ids = React.useMemo(() => data?.rows.map((row) => row.id) ?? [], [data?.rows]);
  const selection = useSelection(ids);

  const onQuery = React.useCallback(
    (next: Partial<QuoteQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "" || (key === "view" && value === "sent") || (key === "invoiced" && value === "any") || (key === "sort" && value === "newest") || (key === "page" && value === 1)) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const selected = data?.rows.filter((row) => selection.isSelected(row.id)) ?? [];
  const one = selected.length === 1 && !selected[0].invoiced ? selected[0] : null;
  // Void and Delete permanently over the selection (P4): as this person's role allows; the server skips a draft or a quote already invoiced, with why.
  const client = useQueryClient();
  const undo = useBulkUndo("quote", () => client.invalidateQueries({ queryKey: ["books"] }));
  const undoEntries = undo.entries(selected.map((row) => ({ id: row.id, label: row.number, posted: data?.query.view !== "draft", party: row.customer, amount: money(row.amount, row.currency) })));
  const customer = data?.customers.find((option) => option.id === data.query.customer);
  const rep = data?.reps.find((option) => option.id === data.query.rep);

  return (
    <>
      <PageChrome
        title="Quotes"
        primary={
          data?.crm
            ? { label: "New quote", icon: "plus", shortcut: "N", href: "/crm/deals" }
            : { label: "New quote", icon: "plus", disabled: "Quotes are written from a deal in the CRM, which this workspace does not have." }
        }
      />
      <BooksPage screen="bk-a">
        {data ? (
          <div className="bk">
            <BooksFinding finding={data.finding} />
            <BkTabs
              label="Quote views"
              value={data.query.view}
              onChange={(view) => onQuery({ view, page: 1 })}
              items={QUOTE_VIEWS.map((view) => ({ value: view, label: QUOTE_TAB_LABEL[view], count: data.counts[view] }))}
            />
            <BkTools
              find="Search quotes"
              query={data.query.q}
              onFind={(q) => onQuery({ q, page: 1 })}
              count={data.range.of === 1 ? "1 quote" : `${data.range.of} quotes`}
              chips={
                <>
                <BkChip
                  label="Customer"
                  value={customer?.name ?? "Any"}
                  set={Boolean(customer)}
                  items={[
                    { key: "any", label: "Any customer", checked: !data.query.customer, onSelect: () => onQuery({ customer: null, page: 1 }) },
                    { separator: true },
                    ...data.customers.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image} />, checked: data.query.customer === option.id, onSelect: () => onQuery({ customer: option.id, page: 1 }) })),
                  ]}
                />
                <BkChip
                  label="Rep"
                  value={rep?.name ?? "Any"}
                  set={Boolean(rep)}
                  items={[
                    { key: "any", label: "Anyone", checked: !data.query.rep, onSelect: () => onQuery({ rep: null, page: 1 }) },
                    { separator: true },
                    ...data.reps.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image} />, checked: data.query.rep === option.id, onSelect: () => onQuery({ rep: option.id, page: 1 }) })),
                  ]}
                />
                </>
              }
              filters={[
                { key: "any", label: "Invoiced or not", checked: data.query.invoiced === "any", onSelect: () => onQuery({ invoiced: "any", page: 1 }) },
                { key: "no", label: "Not invoiced yet", checked: data.query.invoiced === "no", onSelect: () => onQuery({ invoiced: "no", page: 1 }) },
                { key: "yes", label: "Made into an invoice", checked: data.query.invoiced === "yes", onSelect: () => onQuery({ invoiced: "yes", page: 1 }) },
              ]}
              end={
                <>
                <Button variant="quiet" icon="sort" onClick={() => onQuery({ sort: data.query.sort === "newest" ? "oldest" : "newest", page: 1 })}>
                  {data.query.sort === "newest" ? "Sort" : "Oldest first"}
                </Button>
                <Button
                  variant="quiet"
                  icon="export"
                  onClick={() =>
                    downloadCsv(
                      "quotes.csv",
                      ["Quote", "Customer", "For", "Valid until", "Currency", "Amount"],
                      data.rows.map((row) => [row.number, row.customer, row.forWhat, row.validUntil ?? "", row.currency, row.amount.toFixed(2)]),
                    )
                  }
                >
                  Export
                </Button>
                </>
              }
            />
            <TableShell
              label="Quotes"
              foot={
                <TableFoot
                  range={data.range.of === 0 ? "None" : `${data.range.from} to ${data.range.to} of ${data.range.of}`}
                  sums={[{ label: "With customers", value: money(data.out, data.currency) }]}
                  page={{
                    onPrevious: data.query.page > 1 ? () => onQuery({ page: data.query.page - 1 }) : undefined,
                    onNext: data.range.to < data.range.of ? () => onQuery({ page: data.query.page + 1 }) : undefined,
                  }}
                  selection={{
                    count: selected.length,
                    sum: { label: "Total", value: money(selected.reduce((sum, row) => sum + row.amount, 0), data.currency) },
                    onClear: selection.clear,
                    actions: (
                      <>
                        {one ? (
                          <Button icon="invoice" onClick={() => router.push(`/books/invoices/new?quote=${one.id}`)}>
                            Make invoice
                          </Button>
                        ) : null}
                        <Button
                          icon="export"
                          onClick={() =>
                            downloadCsv(
                              "quotes.csv",
                              ["Quote", "Customer", "For", "Valid until", "Currency", "Amount"],
                              selected.map((row) => [row.number, row.customer, row.forWhat, row.validUntil ?? "", row.currency, row.amount.toFixed(2)]),
                            )
                          }
                        >
                          Export
                        </Button>
                        {undoEntries.length ? (
                          <MenuButton label="More" items={undoEntries}>
                            More
                          </MenuButton>
                        ) : null}
                      </>
                    ),
                  }}
                />
              }
            >
              {data.rows.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>{data.query.q || data.query.customer || data.query.rep ? "No quote matches" : `No ${QUOTE_TAB_LABEL[data.query.view].toLowerCase()} quotes`}</b>
                  <p className="muted">{data.query.q || data.query.customer || data.query.rep ? "Clear the search or the filter." : "Quotes are written from a deal; they show here as they move."}</p>
                </div>
              ) : (
                <table className="table" aria-label="Quotes">
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 220 }} />
                    <col />
                    <col style={{ width: 120 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 150 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                      <th>Quote</th>
                      <th>Customer</th>
                      <th>For</th>
                      <th>Valid until</th>
                      <th>On WhatsApp</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                        <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                        <td>{row.crmId && data.crm ? <Link className="ref" href={`/crm/quotes/${row.crmId}`}>{row.number}</Link> : <span className="ref">{row.number}</span>}</td>
                        <td>
                          <span className="cell-lead">
                            <Person name={row.customer} src={row.customerImage} />
                          </span>
                        </td>
                        <td className="fill">
                          <span className="cell-lead muted">{row.invoiced ? `Invoiced. ${row.forWhat}` : row.forWhat}</span>
                        </td>
                        <td className="muted">{row.validUntil ?? "—"}</td>
                        <td className="muted">{row.whatsapp ?? "—"}</td>
                        <td className="num">{money(row.amount, row.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableShell>
          </div>
        ) : quotes.isError ? (
          <BooksError what="Quotes" onRetry={() => quotes.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {undo.node}
    </>
  );
}

export default function BooksQuotesPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksQuotes />
    </React.Suspense>
  );
}
