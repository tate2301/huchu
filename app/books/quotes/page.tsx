"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { downloadCsv } from "@/components/books/bk-list";
import { NewQuote } from "@/components/books/sales/new-quote";
import { Amt, BkError, BkFilter, BkLoading, BkPage, BkPager, BkScroll, BkSelectionBar, BkTabs, BkTools, St, Worksheet, type BkTone, type WsColumn } from "@/components/books/ui";
import { useBulkUndo } from "@/components/books/undo-dialogs";
import { useBooksPlan } from "@/components/books/use-books-plan";
import { Button, useSelection } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { fetchJson } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import { QUOTE_TAB_LABEL, QUOTE_VALID, QUOTE_VALID_LABEL, QUOTE_VIEWS, QUOTES_PAGE_SIZE, type QuoteQuery, type QuoteRow, type QuotesView, type QuoteTab } from "@/lib/books/quotes-view";

type Listed = QuotesView & { crm: boolean };

const DEFAULTS: Record<string, string | number> = { view: "sent", valid: "any", sort: "newest", page: 1 };
const TONE: Record<QuoteTab, BkTone> = { draft: "draft", sent: "info", accepted: "done", expired: "void", void: "void" };

/**
 * Books → Sales → Quotes (bk-quotes): the quotes the CRM's deals write, each
 * opening at `/books/quotes/<id>`. New quote asks which deal, then writes it
 * there. On the Books screens a selection makes the invoice, exports or voids.
 */
function BooksQuotes() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const search = params.toString();
  const plan = useBooksPlan();
  const [creating, setCreating] = React.useState(false);
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
        if (value === null || value === "" || DEFAULTS[key] === value) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const client = useQueryClient();
  const undo = useBulkUndo("quote", () => client.invalidateQueries({ queryKey: ["books"] }));
  const selected = plan.bulk ? (data?.rows.filter((row) => selection.isSelected(row.id)) ?? []) : [];
  const one = selected.length === 1 && selected[0]!.state === "accepted" && !selected[0]!.invoiced ? selected[0]! : null;
  const undoEntries = undo.entries(selected.map((row) => ({ id: row.id, label: row.number, posted: row.state !== "draft", party: row.customer, amount: money(row.amount, row.currency) })));
  const exportRows = (rows: QuoteRow[]) =>
    downloadCsv(
      "quotes.csv",
      ["Quote", "Customer", "Sent", "Valid until", "State", "Currency", "Total", "Next"],
      rows.map((row) => [row.number, row.customer, row.sent ?? "", row.validUntil ?? "", QUOTE_TAB_LABEL[row.state], row.currency, row.amount.toFixed(2), row.next]),
    );

  const columns: Array<WsColumn<QuoteRow>> = data
    ? [
        {
          key: "number",
          head: "Number",
          cell: (row) =>
            row.href ? (
              <Link className={row.state === "draft" ? "none" : "bkw-ref"} href={row.href}>
                {row.number}
              </Link>
            ) : (
              <span className={row.state === "draft" ? "none" : "bkw-ref"}>{row.number}</span>
            ),
        },
        { key: "customer", head: "Customer", cell: (row) => <span className="who">{row.customer}</span> },
        { key: "sent", head: "Sent", className: "muted", cell: (row) => row.sent ?? "—" },
        { key: "valid", head: "Valid until", className: "muted", cell: (row) => row.validUntil ?? "—" },
        { key: "state", head: "State", cell: (row) => <St tone={TONE[row.state]}>{QUOTE_TAB_LABEL[row.state]}</St> },
        { key: "total", head: `Total, ${data.currency}`, right: true, cell: (row) => <Amt value={row.amount} currency={row.currency} /> },
        { key: "next", head: "Next", className: "muted", cell: (row) => row.next },
      ]
    : [];
  const customer = data?.customers.find((option) => option.id === data.query.customer);
  const rep = data?.reps.find((option) => option.id === data.query.rep);
  const filtered = Boolean(data && (data.query.q || data.query.customer || data.query.rep || data.query.valid !== "any"));

  return (
    <>
      <PageChrome
        title="Quotes"
        primary={
          data?.crm === false
            ? { label: "New quote", icon: "plus", disabled: "Quotes are written from a deal in the CRM, which this workspace does not have." }
            : { label: "New quote", icon: "plus", shortcut: "N", onClick: () => setCreating(true) }
        }
      />
      <BkPage screen="quotes" scroll={false}>
        {data ? (
          <>
            <BkTabs label="Quotes" value={data.query.view} onChange={(view) => onQuery({ view, page: 1 })} items={QUOTE_VIEWS.map((view) => ({ value: view, label: QUOTE_TAB_LABEL[view], count: data.counts[view] }))} />
            <BkTools
              find="Search quotes"
              query={data.query.q}
              onFind={(q) => onQuery({ q, page: 1 })}
              count={data.range.of}
              filters={
                <>
                  <BkFilter
                    label="Customer"
                    value={customer?.name ?? "Any"}
                    items={[
                      { key: "any", label: "Any customer", checked: !data.query.customer, onSelect: () => onQuery({ customer: null, page: 1 }) },
                      { separator: true },
                      ...data.customers.map((option) => ({ key: option.id, label: option.name, checked: data.query.customer === option.id, onSelect: () => onQuery({ customer: option.id, page: 1 }) })),
                    ]}
                  />
                  <BkFilter
                    label="Rep"
                    value={rep?.name ?? "Any"}
                    items={[
                      { key: "any", label: "Anyone", checked: !data.query.rep, onSelect: () => onQuery({ rep: null, page: 1 }) },
                      { separator: true },
                      ...data.reps.map((option) => ({ key: option.id, label: option.name, checked: data.query.rep === option.id, onSelect: () => onQuery({ rep: option.id, page: 1 }) })),
                    ]}
                  />
                  <BkFilter
                    label="Valid until"
                    value={QUOTE_VALID_LABEL[data.query.valid]}
                    items={QUOTE_VALID.map((valid) => ({ key: valid, label: QUOTE_VALID_LABEL[valid], checked: data.query.valid === valid, onSelect: () => onQuery({ valid, page: 1 }) }))}
                  />
                </>
              }
              end={
                <>
                  <Button variant="quiet" icon="sort" onClick={() => onQuery({ sort: data.query.sort === "newest" ? "oldest" : "newest", page: 1 })}>
                    {data.query.sort === "newest" ? "Sort" : "Oldest first"}
                  </Button>
                  <Button icon="export" onClick={() => exportRows(data.rows)}>
                    Export
                  </Button>
                </>
              }
            />
            <BkScroll>
              <Worksheet
                label="quotes"
                rows={data.rows}
                rowKey={(row) => row.id}
                columns={columns}
                openHref={(row) => row.href}
                selection={plan.bulk ? { ...selection, selected: selection.selected, labelOf: (row) => row.number } : undefined}
                totals={columns.map((column, index) => (index === 0 ? `${data.rows.length} ${data.rows.length === 1 ? "quote" : "quotes"}` : column.key === "total" ? <Amt value={data.total} currency={data.currency} /> : null))}
                empty={filtered ? "No quote matches. Clear the search or the filters." : `No ${QUOTE_TAB_LABEL[data.query.view].toLowerCase()} quotes.`}
              />
            </BkScroll>
            <BkPager page={data.query.page} size={QUOTES_PAGE_SIZE} total={data.range.of} onPage={(page) => onQuery({ page })} />
            {plan.bulk ? (
              <BkSelectionBar count={selected.length} sum={<>Total <Amt value={selected.reduce((sum, row) => sum + row.amount, 0)} currency={data.currency} /></>} onClear={selection.clear}>
                <Button icon="invoice" disabled={!one} title={one ? undefined : "Pick one accepted quote that has no invoice yet."} onClick={() => one && router.push(`/books/invoices/new?from=${one.id}`)}>
                  Make the invoice
                </Button>
                <Button icon="export" onClick={() => exportRows(selected)}>
                  Export
                </Button>
                {undoEntries.length ? (
                  <MenuButton label="More" items={undoEntries}>
                    More
                  </MenuButton>
                ) : null}
              </BkSelectionBar>
            ) : null}
          </>
        ) : quotes.isError ? (
          <BkError what="Quotes" onRetry={() => quotes.refetch()} />
        ) : (
          <BkLoading />
        )}
      </BkPage>
      <NewQuote open={creating} onOpenChange={setCreating} />
      {undo.node}
    </>
  );
}

/** Books → Sales → Quotes (design/books/html/bk-quotes.html). */
export default function BooksQuotesPage() {
  return (
    <React.Suspense
      fallback={
        <BkPage screen="quotes" scroll={false}>
          <BkLoading />
        </BkPage>
      }
    >
      <BooksQuotes />
    </React.Suspense>
  );
}
