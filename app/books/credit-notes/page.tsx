"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CreditDrawer, type CreditTarget } from "@/components/books/bk-credit-drawer";
import { BkChip, BkState, BkTabs, BkTools, downloadCsv } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksFinding, BooksPage } from "@/components/books/figures";
import { useBulkUndo } from "@/components/books/undo-dialogs";
import { Button, Kit, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CREDIT_REASON_LABEL, CREDIT_REASONS, CREDIT_TAB_LABEL, CREDIT_VIEWS, type CreditNotesView, type CreditQuery } from "@/lib/books/credit-notes-view";
import { money } from "@/lib/books/format";

type Listed = CreditNotesView & { targets: CreditTarget[]; can: { credit: boolean; writeOff: boolean; voidWriteOff: boolean } };

const TONE = { Draft: "plain", Issued: "info", Posted: "info", Void: "void" } as const;

/** Books → Sales → Credit notes (design/core-modules/boards/view/BkCreditNotes.html): credit notes, and write-offs on the second tab. */
function BooksCreditNotes() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const search = params.toString();
  const [drawer, setDrawer] = React.useState<"credit" | "write-off" | null>(null);

  const list = useQuery({
    queryKey: ["books", "credit-notes", search],
    queryFn: () => fetchJson<Listed>(`/api/books/credit-notes${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
  const data = list.data;
  const ids = React.useMemo(() => data?.rows.map((row) => row.id) ?? [], [data?.rows]);
  const selection = useSelection(ids);

  // The old Receivables address asked for a new credit note or write-off with ?action=.
  React.useEffect(() => {
    const action = params.get("action");
    if (action !== "new-credit-note" && action !== "new-write-off") return;
    setDrawer(action === "new-credit-note" ? "credit" : "write-off");
    const rest = new URLSearchParams(params.toString());
    rest.delete("action");
    router.replace(rest.toString() ? `${pathname}?${rest.toString()}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const onQuery = React.useCallback(
    (next: Partial<CreditQuery>) => {
      const merged = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value === null || value === "" || (key === "view" && value === "notes") || (key === "state" && value === "any") || (key === "sort" && value === "newest") || (key === "page" && value === 1)) merged.delete(key);
        else merged.set(key, String(value));
      }
      const query = merged.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const voidWriteOff = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/accounting/sales/write-offs/${id}`, { method: "DELETE", body: JSON.stringify({ reason: "Written off by mistake, undone in Books" }) }),
    onSuccess: async () => {
      toast({ title: "The write-off is void", description: "What it wrote off is owed again.", variant: "success" });
      selection.clear();
      await client.invalidateQueries({ queryKey: ["books"] });
    },
    onError: (error) => toast({ title: "It was not voided", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const selected = data?.rows.filter((row) => selection.isSelected(row.id)) ?? [];
  const writeOffs = data?.query.view === "write-offs";
  // Void and Delete permanently over the selected credit notes (P4): as this person's role allows; the result row by row.
  const undo = useBulkUndo("credit-note", () => client.invalidateQueries({ queryKey: ["books"] }));
  const undoEntries = writeOffs ? [] : undo.entries(selected.map((row) => ({ id: row.id, label: row.number, posted: row.state !== "Draft", party: row.customer, amount: money(row.amount, row.currency) })));
  const customer = data?.customers.find((option) => option.id === data.query.customer);
  const label = writeOffs ? "Write-off" : "Credit note";

  return (
    <>
      <PageChrome
        title="Credit notes"
        primary={
          data && !data.can.credit
            ? { label: "New credit note", icon: "plus", disabled: "Your role cannot issue credit notes. A manager or the accountant can." }
            : { label: "New credit note", icon: "plus", shortcut: "N", onClick: () => setDrawer("credit") }
        }
      >
        {data?.can.writeOff ? (
          <Kit contents>
            <Button icon="retire" onClick={() => setDrawer("write-off")}>
              Write off a debt
            </Button>
          </Kit>
        ) : null}
      </PageChrome>
      <BooksPage screen="bk-a">
        {data ? (
          <div className="bk">
            <BooksFinding finding={data.finding} />
            <BkTabs label="Credit note views" value={data.query.view} onChange={(view) => onQuery({ view, page: 1 })} items={CREDIT_VIEWS.map((view) => ({ value: view, label: CREDIT_TAB_LABEL[view], count: data.counts[view] }))} />
            <BkTools
              find={writeOffs ? "Search write-offs" : "Search credit notes"}
              query={data.query.q}
              onFind={(q) => onQuery({ q, page: 1 })}
              count={`${data.range.of} ${writeOffs ? (data.range.of === 1 ? "write-off" : "write-offs") : data.range.of === 1 ? "credit note" : "credit notes"}`}
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
                  label="Reason"
                  value={data.query.reason ? CREDIT_REASON_LABEL[data.query.reason] : "Any"}
                  set={Boolean(data.query.reason)}
                  items={[
                    { key: "any", label: "Any reason", checked: !data.query.reason, onSelect: () => onQuery({ reason: null, page: 1 }) },
                    { separator: true },
                    ...CREDIT_REASONS.map((reason) => ({ key: reason, label: CREDIT_REASON_LABEL[reason], checked: data.query.reason === reason, onSelect: () => onQuery({ reason, page: 1 }) })),
                  ]}
                />
                </>
              }
              filters={[
                { key: "any", label: "Any state", checked: data.query.state === "any", onSelect: () => onQuery({ state: "any", page: 1 }) },
                ...(writeOffs ? [] : [{ key: "draft", label: "Drafts", checked: data.query.state === "draft", onSelect: () => onQuery({ state: "draft", page: 1 }) }]),
                { key: "issued", label: writeOffs ? "Posted" : "Issued", checked: data.query.state === "issued", onSelect: () => onQuery({ state: "issued", page: 1 }) },
                { key: "void", label: "Void", checked: data.query.state === "void", onSelect: () => onQuery({ state: "void", page: 1 }) },
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
                      writeOffs ? "write-offs.csv" : "credit-notes.csv",
                      [label, "Date", "Customer", "Invoice", "Reason", "State", "Currency", "Amount"],
                      data.rows.map((row) => [row.number, row.date, row.customer, row.invoice.number, row.reason, row.state, row.currency, row.amount.toFixed(2)]),
                    )
                  }
                >
                  Export
                </Button>
                </>
              }
            />
            <TableShell
              label={writeOffs ? "Write-offs" : "Credit notes"}
              foot={
                <TableFoot
                  range={data.range.of === 0 ? "None" : `${data.range.from} to ${data.range.to} of ${data.range.of}`}
                  sums={[
                    { label: data.month.name, value: money(data.month.amount, data.currency) },
                    ...(writeOffs ? [] : [{ label: "Draft", value: money(data.month.drafts, data.currency) }]),
                  ]}
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
                        <Button
                          icon="export"
                          onClick={() =>
                            downloadCsv(
                              writeOffs ? "write-offs.csv" : "credit-notes.csv",
                              [label, "Date", "Customer", "Invoice", "Reason", "State", "Currency", "Amount"],
                              selected.map((row) => [row.number, row.date, row.customer, row.invoice.number, row.reason, row.state, row.currency, row.amount.toFixed(2)]),
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
                        {writeOffs && data.can.voidWriteOff && selected.length === 1 && selected[0].state === "Posted" ? (
                          <Button variant="danger" icon="x" busy={voidWriteOff.isPending} disabled={voidWriteOff.isPending} onClick={() => voidWriteOff.mutate(selected[0].id)}>
                            Void {selected[0].number}
                          </Button>
                        ) : null}
                      </>
                    ),
                  }}
                />
              }
            >
              {data.rows.length === 0 ? (
                <div className="empty" style={{ padding: "var(--space-48) var(--space-24)" }}>
                  <b>{writeOffs ? "No write-offs" : "No credit notes"}</b>
                  <p className="muted">{writeOffs ? "A debt is written off from its invoice, or with Write off a debt." : "A credit note is raised from its invoice, or with New credit note."}</p>
                </div>
              ) : (
                <table className="table" aria-label={writeOffs ? "Write-offs" : "Credit notes"}>
                  <colgroup>
                    <col style={{ width: 44 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 120 }} />
                    <col />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 140 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                      <th>{label}</th>
                      <th>Customer</th>
                      <th>Invoice</th>
                      <th>Reason</th>
                      <th>State</th>
                      <th className="num">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row) => (
                      <tr key={row.id} aria-selected={selection.isSelected(row.id) || undefined}>
                        <SelectCell checked={selection.isSelected(row.id)} onChange={() => selection.toggle(row.id)} label={`Select ${row.number}`} />
                        <td>
                          <span className={row.state === "Draft" ? "muted" : "ref"}>{row.number}</span>
                        </td>
                        <td>
                          <span className="cell-lead">
                            <Person name={row.customer} src={row.customerImage} />
                          </span>
                        </td>
                        <td>
                          <Link className="ref" href={`/books/invoices/${row.invoice.id}`}>
                            {row.invoice.number}
                          </Link>
                        </td>
                        <td className="fill">
                          <span className="cell-lead muted">{row.reason || "—"}</span>
                        </td>
                        <td>
                          <BkState tone={TONE[row.state]}>{row.state}</BkState>
                        </td>
                        <td className="num" style={row.state === "Void" ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                          {money(row.amount, row.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </TableShell>
          </div>
        ) : list.isError ? (
          <BooksError what="Credit notes" onRetry={() => list.refetch()} />
        ) : (
          <BooksLoading />
        )}
      </BooksPage>
      {undo.node}
      {data ? (
        <CreditDrawer
          kind={drawer ?? "credit"}
          targets={drawer === "write-off" ? data.targets.filter((target) => target.balance > 0.005) : data.targets}
          open={drawer !== null}
          onOpenChange={(open) => (open ? undefined : setDrawer(null))}
          onDone={async (message) => {
            toast({ ...message, variant: "success" });
            await client.invalidateQueries({ queryKey: ["books"] });
          }}
        />
      ) : null}
    </>
  );
}

export default function BooksCreditNotesPage() {
  return (
    <React.Suspense fallback={<BooksPage screen="bk-a"><BooksLoading /></BooksPage>}>
      <BooksCreditNotes />
    </React.Suspense>
  );
}
