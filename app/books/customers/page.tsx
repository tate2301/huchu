"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { BkChip, BkQuietTools, BkTabs, BkTools, useBkLayout } from "@/components/books/bk-list";
import { PartyDrawer } from "@/components/books/bk-party-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksFinding, BooksPage, Cents } from "@/components/books/figures";
import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson } from "@/lib/api-client";
import { CUSTOMER_AGES, CUSTOMER_AGE_LABEL, CUSTOMER_TAB_LABEL, CUSTOMER_VIEWS, type CustomerAge, type CustomerQuery, type CustomersView } from "@/lib/books/customers-view";
import { count, money } from "@/lib/books/format";

/** An amount in a column: cents muted, a dash for nothing. */
const amount = (n: number, currency: string) => (Math.abs(n) > 0.005 ? <Cents value={n} currency={currency} /> : <span className="muted">—</span>);

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
  const source = React.useMemo(() => data?.rows ?? [], [data?.rows]);
  const layout = useBkLayout("customers", [{ key: "rep", label: "Rep", nth: 3 }, { key: "notdue", label: "Not due", nth: 4 }, { key: "d1", label: "1–7 days", nth: 5 }, { key: "d8", label: "8–30 days", nth: 6 }, { key: "over30", label: "Over 30", nth: 7 }, { key: "account", label: "On account", nth: 8 }], [{ key: "rep", label: "Rep", by: (row) => row.rep?.name ?? "No rep" }], source);
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
  const selected = data?.rows.filter((row) => selection.isSelected(row.id)) ?? [];
  const owingIds = data?.rows.filter((row) => row.owes > 0.005).map((row) => row.id) ?? [];
  const sumAge = (age: CustomerAge) => data?.rows.reduce((sum, row) => sum + row.age[age], 0) ?? 0;
  const rep = data?.reps.find((option) => option.id === data.query.rep);
  const countLabel = !data ? "" : data.query.view === "owing" || data.query.view === "by-age" ? `${data.range.of.toLocaleString("en-GB")} owing` : data.query.view === "on-account" ? `${data.range.of.toLocaleString("en-GB")} on account` : count(data.range.of, "customer");

  return (
    <>
      <PageChrome title="Customers" primary={{ label: "New customer", icon: "plus", shortcut: "N", onClick: () => setAdding(true) }} />
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
              count={countLabel}
              chips={
                <>
                <BkChip
                  label="Rep"
                  value={rep?.name ?? "Any"}
                  set={Boolean(data.query.rep)}
                  items={[
                    { key: "any", label: "Any rep", checked: !data.query.rep, onSelect: () => onQuery({ rep: null, page: 1 }) },
                    { separator: true },
                    ...data.reps.map((option) => ({ key: option.id, label: <Person name={option.name} src={option.image} />, checked: data.query.rep === option.id, onSelect: () => onQuery({ rep: option.id, page: 1 }) })),
                  ]}
                />
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
                </>
              }
              filters={[
                { key: "any", label: "With or without a VAT number", checked: data.query.vat === "any", onSelect: () => onQuery({ vat: "any", page: 1 }) },
                { key: "yes", label: "With a VAT number", checked: data.query.vat === "yes", onSelect: () => onQuery({ vat: "yes", page: 1 }) },
                { key: "no", label: "No VAT number on file", checked: data.query.vat === "no", onSelect: () => onQuery({ vat: "no", page: 1 }) },
              ]}
              end={
                <BkQuietTools
                  middle={layout.tools}
                  onSort={() => onQuery({ sort: data.query.sort === "name" ? "owes" : "name", page: 1 })}
                  sortLabel={data.query.sort === "name" ? "Sort" : "Owes most first"}
                  exportHref={`/api/books/customers?${new URLSearchParams([...params.entries(), ["format", "csv"]]).toString()}`}
                  extra={
                    <Button variant="quiet" icon="print" onClick={() => statements(selected.length ? selected.map((row) => row.id) : owingIds)}>
                      Statements
                    </Button>
                  }
                />
              }
            />
            <div className={layout.wrap} style={{ display: "contents" }}>
{layout.style}
<TableShell
              label="Customers"
              foot={
                <TableFoot
                  range={data.range.of === 0 ? "None" : `${data.range.from} to ${data.range.to} of ${data.range.of}`}
                  page={{
                    onPrevious: data.query.page > 1 ? () => onQuery({ page: data.query.page - 1 }) : undefined,
                    onNext: data.range.to < data.range.of ? () => onQuery({ page: data.query.page + 1 }) : undefined,
                  }}
                  selection={{
                    count: selected.length,
                    sum: { label: "Owes", value: money(selected.reduce((sum, row) => sum + row.balance, 0), data.currency) },
                    onClear: selection.clear,
                    actions: (
                      <>
                        <Button icon="whatsapp" onClick={() => statements(selected.map((row) => row.id))}>
                          Send statements
                        </Button>
                        <Button icon="print" onClick={() => statements(selected.map((row) => row.id))}>
                          Print statements
                        </Button>
                      </>
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
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col />
                    <col style={{ width: 168 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 128 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every customer" />
                      <th>Customer</th>
                      <th>Rep</th>
                      {CUSTOMER_AGES.map((age) => (
                        <th className="num" key={age}>
                          {CUSTOMER_AGE_LABEL[age]}
                        </th>
                      ))}
                      <th className="num">On account</th>
                      <th className="num">Owes, {data.currency}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {layout.rows((row) => (
                      <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                        <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.name}`} />
                        <td className="fill">
                          <Link className="cell-lead" href={`/books/customers/${row.id}`}>
                            {row.code ? (
                              <>
                                <span className="ref">{row.code}</span>{" "}
                              </>
                            ) : null}
                            {row.name}
                          </Link>
                        </td>
                        <td>{row.rep ? <Person name={row.rep.name} src={row.rep.image} /> : <span className="muted">—</span>}</td>
                        {CUSTOMER_AGES.map((age) => (
                          <td className="num" key={age}>
                            {amount(row.age[age], data.currency)}
                          </td>
                        ))}
                        <td className="num">{amount(-row.onAccount, data.currency)}</td>
                        <td className="num" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                          {amount(row.balance, data.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="tot">
                      <td />
                      <td>{data.range.of > data.rows.length ? `${data.rows.length.toLocaleString("en-GB")} of ${data.range.of.toLocaleString("en-GB")}` : countLabel}</td>
                      <td />
                      {CUSTOMER_AGES.map((age) => (
                        <td className="num" key={age}>
                          {amount(sumAge(age), data.currency)}
                        </td>
                      ))}
                      <td className="num">{amount(-data.rows.reduce((sum, row) => sum + row.onAccount, 0), data.currency)}</td>
                      <td className="num">{amount(data.rows.reduce((sum, row) => sum + row.balance, 0), data.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </TableShell>
</div>
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
