"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Drawer, Field, Input, Select } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { parseTrialBalanceCsv } from "@/lib/books/opening-csv";
import type { OpeningBalances } from "@/lib/books/settings-pages";

type Line = { accountId: string; debit: string; credit: string };
type Opening = OpeningBalances & { accounts: Array<{ id: string; code: string; label: string }> };

const amount = (text: string) => {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
};
const plain = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Add or revise the opening balances (owner or accountant): the day before the books start, each account's debit or credit, balanced. */
export function OpeningDrawer({ open, onOpenChange, onSaved, csv }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void; csv: boolean }) {
  const query = useQuery({ queryKey: ["books", "opening-balances"], queryFn: () => fetchJson<Opening>("/api/books/settings/opening-balances"), enabled: open });
  const data = query.data;
  const [date, setDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const picker = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (!open || !data) return;
    setError(null);
    setReason("");
    setDate(data.date ?? new Date(Date.now() - 86_400_000).toISOString().slice(0, 10));
    setLines(data.lines.length ? data.lines.map((line) => ({ accountId: line.accountId, debit: line.debit ? String(line.debit) : "", credit: line.credit ? String(line.credit) : "" })) : [{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }]);
    if (csv) window.setTimeout(() => picker.current?.click(), 50);
  }, [open, data, csv]);
  const debit = lines.reduce((sum, line) => sum + amount(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + amount(line.credit), 0);
  const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
  const revising = Boolean(data?.posted);
  const save = useMutation({
    mutationFn: () => fetchJson("/api/books/settings/opening-balances", { method: "POST", body: JSON.stringify({ date, reason: reason.trim() || null, lines: lines.filter((line) => line.accountId && (amount(line.debit) || amount(line.credit))).map((line) => ({ accountId: line.accountId, debit: amount(line.debit), credit: amount(line.credit) })) }) }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (failure) => setError(getApiErrorMessage(failure, "Check the connection and try again.")),
  });
  const load = async (file: File | undefined) => {
    if (!file || !data) return;
    const parsed = parseTrialBalanceCsv(await file.text(), data.accounts);
    if (parsed.lines.length) setLines(parsed.lines);
    setError(parsed.unknown.length ? `Not in the chart, so left out: ${parsed.unknown.slice(0, 6).join(", ")}${parsed.unknown.length > 6 ? "…" : ""}` : parsed.lines.length ? null : "No rows with an account code and an amount were found.");
  };
  const set = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      width={640}
      title={revising ? "Revise the opening balances" : "Add the opening balances"}
      sub={revising ? "The old ones are reversed and kept in the audit trail; these post after them." : "What each account held the day before the books started."}
      footer={
        <>
          <input ref={picker} type="file" accept=".csv,text/csv" hidden onChange={(event) => void load(event.target.files?.[0])} />
          <Button variant="quiet" icon="upload" onClick={() => picker.current?.click()}>
            Bring in a trial balance, CSV
          </Button>
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!balanced || !date || (revising && reason.trim().length < 3) || save.isPending} onClick={() => save.mutate()}>
            Post the opening balances
          </Button>
        </>
      }
    >
      {!data ? (
        <div className="skeleton" style={{ height: 240, margin: 24 }} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0,1fr)", gap: 12, padding: "0 24px" }}>
            <Field label="As at" htmlFor="opening-date">
              <Input id="opening-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </Field>
            {revising ? (
              <Field label="Why they change" htmlFor="opening-reason">
                <Input id="opening-reason" value={reason} placeholder="The accountant’s final figures" onChange={(event) => setReason(event.target.value)} />
              </Field>
            ) : null}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ tableLayout: "fixed", minWidth: 560 }} aria-label="Opening balances">
              <colgroup>
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 48 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Debit</th>
                  <th className="num">Credit</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td>
                      <Select aria-label={`Account on line ${index + 1}`} value={line.accountId} style={{ width: "100%" }} onChange={(event) => set(index, { accountId: event.target.value })}>
                        <option value="">Choose an account</option>
                        {data.accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.label}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="num">
                      <Input aria-label={`Debit on line ${index + 1}`} className="num" inputMode="decimal" value={line.debit} onChange={(event) => set(index, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} />
                    </td>
                    <td className="num">
                      <Input aria-label={`Credit on line ${index + 1}`} className="num" inputMode="decimal" value={line.credit} onChange={(event) => set(index, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} />
                    </td>
                    <td>{lines.length > 2 ? <Button variant="quiet" iconOnly icon="x" label={`Remove line ${index + 1}`} onClick={() => setLines((current) => current.filter((_, at) => at !== index))} /> : null}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4}>
                    <Button variant="quiet" size="sm" icon="plus" onClick={() => setLines((current) => [...current, { accountId: "", debit: "", credit: "" }])}>
                      Add an account
                    </Button>
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="tot">
                  <td>{balanced ? <span className="status status-success">Balanced</span> : <span className="status status-warning">Off by {plain(Math.abs(debit - credit))}</span>}</td>
                  <td className="num">{plain(debit)}</td>
                  <td className="num">{plain(credit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {error ? (
            <p className="error" role="alert" style={{ padding: "0 24px" }}>
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Drawer>
  );
}
