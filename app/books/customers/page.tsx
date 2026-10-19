"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BkChip, BkQuietTools, BkTabs, BkTools } from "@/components/books/bk-list";
import { PartyDrawer } from "@/components/books/bk-party-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksFinding, BooksPage } from "@/components/books/figures";
import { Button, Kit, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import { CUSTOMER_TAB_LABEL, CUSTOMER_VIEWS, type CustomerQuery, type CustomersView } from "@/lib/books/customers-view";
import { money } from "@/lib/books/format";
import { AGE_BUCKETS } from "@/lib/books/invoices";

const owing = (n: number, currency: string) => (n > 0.005 ? money(n, currency) : "—");

/** Books → Sales → Customers (design/core-modules/boards/view/BkCustomers.html). By age is the receivables aging (`/accounting/receivables` lands here). */
function BooksCustomers() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const search = params.toString();
  const [adding, setAdding] = React.useState(false);

  const customers = useQuery({
    queryKey: ["books", "customers", search],
    queryFn: () => fetchJson<CustomersView>(`/api/books/customers${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const data = customers.data;
  const ids = React.useMemo(() => data?.rows.map((row) => row.id) ?? [], [data?.rows]);
  const selection = useSelection(ids);

  // The old Receivables address asked for New customer with ?action=new-customer.
  React.useEffect(() => {
    if (params.get("action") !== "new-customer") return;
    setAdding(true);
    const rest = new URLSearchParams(params.toString());
    rest.delete("action");
    router.replace(rest.toString() ? `${pathname}?${rest.toString()}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const onQuery = React.useCallback(
    (next: Partial<CustomerQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "" || (key === "view" && value === "all") || (key === "vat" && value === "any") || (key === "sort" && value === "name") || (key === "page" && value === 1)) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const statements = (customerIds: string[]) => window.open(`/books/statements${customerIds.length ? `?customers=${customerIds.join(",")}` : ""}`, "_blank", "noopener");
  const byAge = data?.query.view === "by-age";
  const selected = data?.rows.filter((row) => selection.isSelected(row.id)) ?? [];

  return (
    <>
      <PageChrome title="Customers" primary={{ label: "New customer", icon: "plus", shortcut: "N", onClick: () => setAdding(true) }}>
        <Kit contents>
          <Button icon="send" onClick={() => statements(selected.length ? selected.map((row) => row.id) : (data?.rows.filter((row) => row.owes > 0.005).map((row) => row.id) ?? []))}>
            Send statements
          </Button>
        </Kit>
      </PageChrome>
      <BooksPage screen="bk-a">
        {data ? (
          <div className="bk">
            <BooksFinding finding={data.finding} />
            <BkTabs
              label="Customer views"
              value={data.query.view}
              onChange={(view) => onQuery({ view, page: 1 })}
              items={CUSTOMER_VIEWS.map((view) => ({ value: view, label: CUSTOMER_TAB_LABEL[view], count: view === "by-age" ? null : data.counts[view] }))}
            />
            <BkTools
              find="Search customers"
              query={data.query.q}
              onFind={(q) => onQuery({ q, page: 1 })}
              count={`${data.rows.length} of ${data.range.of}`}
              chips={
                <BkChip
                  label="Currency"
                  value={data.query.currency ?? "Any"}
                  set={Boolean(data.query.currency)}
                  items={[
                    { key: "any", label: "The main one", checked: !data.query.currency, onSelect: () => onQuery({ currency: null, page: 1 }) },
                    { separator: true },
                    ...data.currencies.map((code) => ({ key: code, label: code, checked: data.query.currency === code, onSelect: () => onQuery({ currency: code, page: 1 }) })),
                  ]}
                />
              }
              filters={[
                { key: "any", label: "With or without a VAT number", checked: data.query.vat === "any", onSelect: () => onQuery({ vat: "any", page: 1 }) },
                { key: "yes", label: "With a VAT number", checked: data.query.vat === "yes", onSelect: () => onQuery({ vat: "yes", page: 1 }) },
                { key: "no", label: "No VAT number on file", checked: data.query.vat === "no", onSelect: () => onQuery({ vat: "no", page: 1 }) },
              ]}
              end={
                <BkQuietTools
                  onSort={() => onQuery({ sort: data.query.sort === "name" ? "owes" : "name", page: 1 })}
                  sortLabel={data.query.sort === "name" ? "Sort" : "Owes most first"}
                  exportHref={`/api/books/customers?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
                />
              }
            />
            <TableShell
              label="Customers"
              foot={
                <TableFoot
                  range={data.range.of === 0 ? "None" : `${data.range.from} to ${data.range.to} of ${data.range.of}`}
                  sums={[
                    { label: "Owed", value: money(data.totals.owed, data.currency) },
                    { label: "Overdue", value: money(data.totals.overdue, data.currency) },
                    { label: "On account", value: money(data.totals.onAccount, data.currency) },
                  ]}
                  page={{
                    onPrevious: data.query.page > 1 ? () => onQuery({ page: data.query.page - 1 }) : undefined,
                    onNext: data.range.to < data.range.of ? () => onQuery({ page: data.query.page + 1 }) : undefined,
                  }}
                  selection={{
                    count: selected.length,
                    sum: { label: "Owes", value: money(selected.reduce((sum, row) => sum + row.owes, 0), data.currency) },
                    onClear: selection.clear,
                    actions: (
                      <Button icon="print" onClick={() => statements(selected.map((row) => row.id))}>
                        Print statements
                      </Button>
                    ),
                  }}
                />
              }
            >
              {data.rows.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>{data.query.q || data.query.view !== "all" ? "No customer matches" : "No customers yet"}</b>
                  <p className="muted">{data.query.q || data.query.view !== "all" ? "Clear the search or pick another tab." : "Add one with New customer."}</p>
                </div>
              ) : (
                <table className="table" aria-label="Customers">
                  <thead>
                    <tr>
                      <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                      <th>Customer</th>
                      {byAge ? (
                        AGE_BUCKETS.map((bucket) => (
                          <th className="num" key={bucket}>
                            {bucket}
                          </th>
                        ))
                      ) : (
                        <>
                          <th>Accounts contact</th>
                          <th className="num">Owes</th>
                          <th className="num">Overdue</th>
                          <th className="num">On account</th>
                          <th>Last paid</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                        <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.name}`} />
                        <td>
                          <Link className="cell-lead" href={`/books/customers/${row.id}`}>
                            <Person name={row.name} src={row.image} />
                          </Link>
                        </td>
                        {byAge ? (
                          AGE_BUCKETS.map((bucket) => (
                            <td className={row.ages[bucket] > 0.005 && bucket !== "Not yet due" ? "num" : "num muted"} key={bucket}>
                              {owing(row.ages[bucket], data.currency)}
                            </td>
                          ))
                        ) : (
                          <>
                            <td className="muted">{row.contact ?? "—"}</td>
                            <td className="num" style={row.owes > 0.005 ? { color: "var(--color-ink)", fontWeight: 500 } : undefined}>
                              {owing(row.owes, data.currency)}
                            </td>
                            <td className="num">{owing(row.overdue, data.currency)}</td>
                            <td className="num muted">{owing(row.onAccount, data.currency)}</td>
                            <td className="muted">{row.lastPaid ?? "—"}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableShell>
          </div>
        ) : customers.isError ? (
          <BooksError what="Customers" onRetry={() => customers.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      <PartyDrawer
        kind="customer"
        open={adding}
        onOpenChange={setAdding}
        onCreated={async (party) => {
          toast({ title: `${party.name} is added`, variant: "success" });
          await client.invalidateQueries({ queryKey: ["books", "customers"] });
          router.push(`/books/customers/${party.id}`);
        }}
      />
    </>
  );
}

export default function BooksCustomersPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksCustomers />
    </React.Suspense>
  );
}
