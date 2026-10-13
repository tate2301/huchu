"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Drawer, Field, Input, Select } from "@/components/core";
import { fetchChartOfAccounts } from "@/lib/api";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";

type Line = { accountId: string; debit: string; credit: string; memo: string };

const blank = (): Line => ({ accountId: "", debit: "", credit: "", memo: "" });
const amount = (text: string) => {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
};
const today = () => new Date().toISOString().slice(0, 10);

/**
 * New journal (N on Journals): the day, the memo and two or more lines that
 * balance. Saved as a draft, or posted at once; a closed month asks why.
 */
export function NewJournalDrawer({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const [date, setDate] = React.useState(today);
  const [memo, setMemo] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([blank(), blank()]);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [needsReason, setNeedsReason] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDate(today());
    setMemo("");
    setLines([blank(), blank()]);
    setReason("");
    setError(null);
    setNeedsReason(false);
  }, [open]);

  const accounts = useQuery({
    queryKey: ["accounting", "coa", "ledger"],
    queryFn: () => fetchChartOfAccounts({ limit: 500, active: true, nodeType: "LEDGER" }),
    enabled: open,
    staleTime: 60_000,
  });

  const debit = lines.reduce((sum, line) => sum + amount(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + amount(line.credit), 0);
  const filled = lines.filter((line) => line.accountId && (amount(line.debit) > 0 || amount(line.credit) > 0));
  const balanced = filled.length >= 2 && Math.abs(debit - credit) < 0.005 && debit > 0;
  const ready = balanced && memo.trim().length > 0 && Boolean(date) && (!needsReason || reason.trim().length >= 3);

  const save = useMutation({
    mutationFn: (status: "DRAFT" | "POSTED") =>
      fetchJson("/api/accounting/journals", {
        method: "POST",
        body: JSON.stringify({
          entryDate: date,
          description: memo.trim(),
          status,
          periodOverrideReason: reason.trim() || undefined,
          lines: filled.map((line) => ({
            accountId: line.accountId,
            debit: amount(line.debit),
            credit: amount(line.credit),
            memo: line.memo.trim() || undefined,
          })),
        }),
      }),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (failure) => {
      const message = getApiErrorMessage(failure, "Check the connection and try again.");
      if (/period|locked|closed/i.test(message)) setNeedsReason(true);
      setError(message);
    },
  });

  const set = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New journal"
      width={720}
      footer={
        <>
          <span className="muted" style={{ flex: 1 }}>
            {balanced ? `Balances at ${money(debit)}` : `Debits ${money(debit)}, credits ${money(credit)}`}
          </span>
          <Button disabled={!ready || save.isPending} onClick={() => save.mutate("DRAFT")}>
            Save as draft
          </Button>
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!ready || save.isPending} onClick={() => save.mutate("POSTED")}>
            Post
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0,1fr)", gap: 12 }}>
          <Field label="Date" htmlFor="journal-date">
            <Input id="journal-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Memo" htmlFor="journal-memo">
            <Input id="journal-memo" value={memo} placeholder="Month-end payroll accrual" onChange={(event) => setMemo(event.target.value)} />
          </Field>
        </div>
        <table className="table" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col />
            <col style={{ width: 110 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 44 }} />
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
                  <Select aria-label={`Account on line ${index + 1}`} value={line.accountId} onChange={(event) => set(index, { accountId: event.target.value })} style={{ width: "100%" }}>
                    <option value="">Choose an account</option>
                    {(accounts.data?.data ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} {account.name}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <Input
                    aria-label={`Debit on line ${index + 1}`}
                    inputMode="decimal"
                    className="num"
                    value={line.debit}
                    onChange={(event) => set(index, { debit: event.target.value, credit: event.target.value ? "" : line.credit })}
                  />
                </td>
                <td>
                  <Input
                    aria-label={`Credit on line ${index + 1}`}
                    inputMode="decimal"
                    className="num"
                    value={line.credit}
                    onChange={(event) => set(index, { credit: event.target.value, debit: event.target.value ? "" : line.debit })}
                  />
                </td>
                <td>
                  {lines.length > 2 ? (
                    <Button variant="quiet" iconOnly icon="x" label={`Remove line ${index + 1}`} onClick={() => setLines((current) => current.filter((_, at) => at !== index))} />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <span>
          <Button icon="plus" onClick={() => setLines((current) => [...current, blank()])}>
            Add a line
          </Button>
        </span>
        {needsReason ? (
          <Field label="Why it posts into a closed month" htmlFor="journal-override">
            <Input id="journal-override" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
        ) : null}
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
