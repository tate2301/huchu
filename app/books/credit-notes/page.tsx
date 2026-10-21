"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CreditDrawer, type CreditTarget } from "@/components/books/bk-credit-drawer";
import { BkChip, BkState, BkTabs, BkTools, downloadCsv } from "@/components/books/bk-list";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage, Cents } from "@/components/books/figures";
import { useBulkUndo } from "@/components/books/undo-dialogs";
import { Button, SelectCell, TableFoot, TableShell, useSelection, Person } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { CREDIT_REASON_LABEL, CREDIT_REASONS, CREDIT_TAB_LABEL, CREDIT_VIEWS, type CreditNotesView, type CreditQuery } from "@/lib/books/credit-notes-view";
import { count, money } from "@/lib/books/format";

type Listed = CreditNotesView & { targets: CreditTarget[]; can: { credit: boolean; writeOff: boolean; voidWriteOff: boolean } };

type Col = "against" | "date" | "reason" | "fdms" | "vat";
const COLS: Array<{ key: Col; label: string }> = [
  { key: "against", label: "Against" },
  { key: "date", label: "Date" },
  { key: "reason", label: "Reason" },
  { key: "fdms", label: "FDMS" },
  { key: "vat", label: "VAT" },
];
type GroupBy = "none" | "customer" | "reason";
const FDMS_TONE = { Valid: "success", Pending: "warning", Failed: "danger" } as const;
const CSV_HEAD = ["Number", "Customer", "Against", "Date", "Reason", "FDMS", "VAT", "Currency", "Amount"];

const ellipsis: React.CSSProperties = { display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

/** Books → Sales → Credit notes (design/core-modules/boards/view/BkCreditNotes.html): credit notes, and write-offs on the second tab. */
function BooksCreditNotes() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const client = useQueryClient();
  const { toast } = useToast();
  const search = params.toString();
  const [drawer, setDrawer] = React.useState<"credit" | "write-off" | null>(null);
  const [hidden, setHidden] = React.useState<Col[]>([]);
  const [groupBy, setGroupBy] = React.useState<GroupBy>("none");

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
  const paged = data ? data.range.of > data.rows.length || data.query.page > 1 : false;
  const csvRow = (row: CreditNotesView["rows"][number]) => [row.number, row.customer, row.invoice.number, row.date, row.reason, row.fiscal ?? "", row.vat === null ? "" : row.vat.toFixed(2), row.currency, row.amount.toFixed(2)];
  const shown = (key: Col) => !hidden.includes(key);

  const grouped = React.useMemo(() => {
    const rows = data?.rows ?? [];
    type Entry = { row: CreditNotesView["rows"][number] } | { group: string; n: number };
    if (groupBy === "none") return rows.map((row): Entry => ({ row }));
    const key = (row: CreditNotesView["rows"][number]) => (groupBy === "customer" ? row.customer : row.reason.split(",")[0].trim() || "No reason");
    const names = [...new Set(rows.map(key))].sort((a, b) => a.localeCompare(b, "en-GB"));
    return names.flatMap((name): Entry[] => {
      const inside = rows.filter((row) => key(row) === name);
      return [{ group: name, n: inside.length }, ...inside.map((row): Entry => ({ row }))];
    });
  }, [data?.rows, groupBy]);

  return (
    <>
      <PageChrome
        title="Credit notes"
        primary={
          data && !data.can.credit
            ? { label: "New credit note", icon: "plus", disabled: "Your role cannot issue credit notes. A manager or the accountant can." }
            : { label: "New credit note", icon: "plus", shortcut: "N", onClick: () => setDrawer("credit") }
        }
      />
      <BooksPage screen="bk-a">
        {data ? (
          <div className="bk">
            <BkTabs label="Credit note views" value={data.query.view} onChange={(view) => onQuery({ view, page: 1 })} items={CREDIT_VIEWS.map((view) => ({ value: view, label: CREDIT_TAB_LABEL[view], count: data.counts[view] }))} />
            <BkTools
              find={writeOffs ? "Search write-offs" : "Search credit notes"}
              query={data.query.q}
              onFind={(q) => onQuery({ q, page: 1 })}
              count={String(data.range.of)}
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
                  {data.can.writeOff ? (
                    <Button variant="quiet" icon="retire" onClick={() => setDrawer("write-off")}>
                      Write off a debt
                    </Button>
                  ) : null}
                  <Button variant="quiet" icon="sort" onClick={() => onQuery({ sort: data.query.sort === "newest" ? "oldest" : "newest", page: 1 })}>
                    {data.query.sort === "newest" ? "Sort" : "Oldest first"}
                  </Button>
                  <MenuButton
                    variant="quiet"
                    icon="sections"
                    label="Group"
                    items={(["none", "customer", "reason"] as const).map((key) => ({ key, label: { none: "No grouping", customer: "Customer", reason: "Reason" }[key], checked: groupBy === key, onSelect: () => setGroupBy(key) }))}
                  >
                    Group
                  </MenuButton>
                  <MenuButton
                    variant="quiet"
                    icon="eye"
                    label="Columns"
                    items={COLS.map((col) => ({ key: col.key, label: col.label, checked: !hidden.includes(col.key), onSelect: () => setHidden((now) => (now.includes(col.key) ? now.filter((key) => key !== col.key) : [...now, col.key])) }))}
                  >
                    Columns
                  </MenuButton>
                  <Button variant="quiet" icon="export" onClick={() => downloadCsv(writeOffs ? "write-offs.csv" : "credit-notes.csv", CSV_HEAD, data.rows.map(csvRow))}>
                    Export
                  </Button>
                </>
              }
            />
            <TableShell
              label={writeOffs ? "Write-offs" : "Credit notes"}
              foot={
                paged || selected.length > 0 ? (
                <TableFoot
                  range={paged ? `${data.range.from} to ${data.range.to} of ${data.range.of}` : undefined}
                  page={
                    paged
                      ? {
                          onPrevious: data.query.page > 1 ? () => onQuery({ page: data.query.page - 1 }) : undefined,
                          onNext: data.range.to < data.range.of ? () => onQuery({ page: data.query.page + 1 }) : undefined,
                        }
                      : undefined
                  }
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
                              CSV_HEAD,
                              selected.map(csvRow),
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
                ) : undefined
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
                    <col style={{ width: 112 }} />
                    <col style={{ width: 208 }} />
                    {shown("against") ? <col style={{ width: 120 }} /> : null}
                    {shown("date") ? <col style={{ width: 88 }} /> : null}
                    {shown("reason") ? <col /> : null}
                    {shown("fdms") ? <col style={{ width: 104 }} /> : null}
                    {shown("vat") ? <col style={{ width: 112 }} /> : null}
                    <col style={{ width: 144 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <SelectCell head checked={selection.all} indeterminate={selection.some} onChange={selection.toggleAll} label="Select every row on this page" />
                      <th>Number</th>
                      <th>Customer</th>
                      {shown("against") ? <th>Against</th> : null}
                      {shown("date") ? <th>Date</th> : null}
                      {shown("reason") ? <th>Reason</th> : null}
                      {shown("fdms") ? <th>FDMS</th> : null}
                      {shown("vat") ? <th className="num">VAT</th> : null}
                      <th className="num">Amount, {data.currency}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped.map((entry) =>
                      "group" in entry ? (
                        <tr key={`group-${entry.group}`} className="group">
                          <td colSpan={3 + COLS.filter((col) => shown(col.key)).length}>
                            <b>{entry.group}</b> <span className="muted">{entry.n}</span>
                          </td>
                        </tr>
                      ) : (
                        <tr key={entry.row.id} aria-selected={selection.isSelected(entry.row.id) || undefined}>
                          <SelectCell checked={selection.isSelected(entry.row.id)} onChange={() => selection.toggle(entry.row.id)} label={`Select ${entry.row.number}`} />
                          <td>
                            <span className={entry.row.state === "Draft" ? "muted" : "ref"}>{entry.row.number}</span>
                          </td>
                          <td>
                            <span style={ellipsis}>{entry.row.customer}</span>
                          </td>
                          {shown("against") ? (
                            <td>
                              <Link className="ref" href={`/books/invoices/${entry.row.invoice.id}`}>
                                {entry.row.invoice.number}
                              </Link>
                            </td>
                          ) : null}
                          {shown("date") ? <td className="muted">{entry.row.date}</td> : null}
                          {shown("reason") ? (
                            <td>
                              <span style={ellipsis}>{entry.row.reason || "—"}</span>
                            </td>
                          ) : null}
                          {shown("fdms") ? <td>{entry.row.fiscal ? <BkState tone={FDMS_TONE[entry.row.fiscal]}>{entry.row.fiscal}</BkState> : <span className="muted">—</span>}</td> : null}
                          {shown("vat") ? <td className="num">{entry.row.vat === null ? <span className="muted">—</span> : <Cents value={entry.row.vat} currency={entry.row.currency} />}</td> : null}
                          <td className="num" style={entry.row.state === "Void" ? { textDecoration: "line-through", color: "var(--color-muted)" } : undefined}>
                            <Cents value={entry.row.amount} currency={entry.row.currency} />
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td />
                      <td colSpan={2 + COLS.filter((col) => shown(col.key) && col.key !== "vat").length}>
                        <b>{count(data.range.of, writeOffs ? "write-off" : "credit note")}</b>
                      </td>
                      {shown("vat") ? <td className="num">{data.totals.vat === null ? <span className="muted">—</span> : <Cents value={data.totals.vat} currency={data.currency} />}</td> : null}
                      <td className="num">
                        <Cents value={data.totals.amount} currency={data.currency} />
                      </td>
                    </tr>
                  </tfoot>
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
