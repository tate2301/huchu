"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { Button, Drawer, Field, Icon, Input, Select } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { JournalFormOptions } from "@/lib/books/journals";
import { uploadBooksFile, type BooksFile } from "@/lib/books/upload-client";

type Line = { accountId: string; costCenterId: string; debit: string; credit: string };
type Outcome = { id: string; state: "draft" | "to-approve" | "posted"; ref: string | null };

const blank = (): Line => ({ accountId: "", costCenterId: "", debit: "", credit: "" });
const amount = (text: string) => {
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : 0;
};
const today = () => new Date().toISOString().slice(0, 10);
const plain = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * New journal (BkJournalNew, N on Journals): the date and the memo, the
 * currency and the slip, then two or more lines with their cost centres that
 * balance. Save as draft, or Post this journal (Ctrl ↵); over the limit it
 * goes to a second person instead, and a closed month asks why.
 */
export function NewJournalDrawer({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; onSaved: (outcome: Outcome) => void }) {
  const [date, setDate] = React.useState(today);
  const [memo, setMemo] = React.useState("");
  const [currency, setCurrency] = React.useState("");
  const [lines, setLines] = React.useState<Line[]>([blank(), blank()]);
  const [file, setFile] = React.useState<BooksFile | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [needsReason, setNeedsReason] = React.useState(false);
  const picker = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setDate(today());
    setMemo("");
    setCurrency("");
    setLines([blank(), blank()]);
    setFile(null);
    setReason("");
    setError(null);
    setNeedsReason(false);
  }, [open]);

  const form = useQuery({ queryKey: ["books", "journal-form"], queryFn: () => fetchJson<JournalFormOptions>("/api/books/journals/form"), enabled: open, staleTime: 60_000 });
  const options = form.data;
  const code = currency || options?.baseCurrency || "USD";

  const debit = lines.reduce((sum, line) => sum + amount(line.debit), 0);
  const credit = lines.reduce((sum, line) => sum + amount(line.credit), 0);
  const filled = lines.filter((line) => line.accountId && (amount(line.debit) > 0 || amount(line.credit) > 0));
  const balanced = filled.length >= 2 && Math.abs(debit - credit) < 0.005 && debit > 0;
  const ready = balanced && memo.trim().length > 0 && Boolean(date) && (!needsReason || reason.trim().length >= 3) && !uploading;
  const over = options && options.secondOver > 0 && code === options.baseCurrency && debit > options.secondOver;

  const save = useMutation({
    mutationFn: (post: boolean) =>
      fetchJson<Outcome>("/api/books/journals", {
        method: "POST",
        body: JSON.stringify({
          date,
          memo: memo.trim(),
          currency: code,
          post,
          periodOverrideReason: reason.trim() || undefined,
          attachment: file,
          lines: filled.map((line) => ({ accountId: line.accountId, costCenterId: line.costCenterId || null, debit: amount(line.debit), credit: amount(line.credit) })),
        }),
      }),
    onSuccess: (outcome) => {
      onSaved(outcome);
      onOpenChange(false);
    },
    onError: (failure) => {
      const message = getApiErrorMessage(failure, "Check the connection and try again.");
      if (/reason|closed|override/i.test(message)) setNeedsReason(true);
      setError(message);
    },
  });

  const set = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  const attach = async (picked: File | undefined) => {
    if (!picked) return;
    setUploading(true);
    setError(null);
    try {
      setFile(await uploadBooksFile(picked));
    } catch (failure) {
      setError(getApiErrorMessage(failure, "That file was not added."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="New journal"
      width={640}
      footer={
        <>
          <Button icon="docs" disabled={!ready || save.isPending} onClick={() => save.mutate(false)}>
            Save as draft
          </Button>
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={save.isPending} disabled={!ready || save.isPending} onClick={() => save.mutate(true)}>
            {over ? "Send for approval" : "Post this journal"}
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "16px 0" }}>
        <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", gap: 12, padding: "0 24px" }}>
          <Field label="Date" htmlFor="journal-date">
            <Input id="journal-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Memo" htmlFor="journal-memo">
            <Input id="journal-memo" value={memo} placeholder="What it moves, and why" onChange={(event) => setMemo(event.target.value)} />
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "150px minmax(0,1fr)", gap: 12, padding: "0 24px" }}>
          <Field label="Currency" htmlFor="journal-currency">
            <Select id="journal-currency" value={code} onChange={(event) => setCurrency(event.target.value)}>
              {(options?.currencies ?? [code]).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Attachment" htmlFor="journal-file" optional>
            <input ref={picker} id="journal-file" type="file" accept="application/pdf,image/*" hidden onChange={(event) => void attach(event.target.files?.[0])} />
            <Button variant="quiet" icon={file ? "file" : "photo"} busy={uploading} onClick={() => picker.current?.click()} style={{ justifyContent: "flex-start" }}>
              {file ? file.name : "Add the slip or a note"}
            </Button>
          </Field>
        </div>
        <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ tableLayout: "fixed", minWidth: 592 }} aria-label="Lines">
          <colgroup>
            <col />
            <col style={{ width: 160 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th>Account</th>
              <th>Cost centre</th>
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
                    {(options?.accounts ?? []).map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td>
                  <Select aria-label={`Cost centre on line ${index + 1}`} value={line.costCenterId} onChange={(event) => set(index, { costCenterId: event.target.value })} style={{ width: "100%" }}>
                    <option value="">General</option>
                    {(options?.costCentres ?? []).map((centre) => (
                      <option key={centre.id} value={centre.id}>
                        {centre.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="num">
                  <Input aria-label={`Debit on line ${index + 1}`} inputMode="decimal" className="num" placeholder="0.00" value={line.debit} onChange={(event) => set(index, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} />
                </td>
                <td className="num">
                  <Input aria-label={`Credit on line ${index + 1}`} inputMode="decimal" className="num" placeholder="0.00" value={line.credit} onChange={(event) => set(index, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} />
                </td>
                <td>
                  {lines.length > 2 ? <Button variant="quiet" iconOnly icon="x" label={`Remove line ${index + 1}`} onClick={() => setLines((current) => current.filter((_, at) => at !== index))} /> : null}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5}>
                <Button variant="quiet" size="sm" icon="plus" onClick={() => setLines((current) => [...current, blank()])}>
                  Add a line
                </Button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="tot">
              <td>Totals</td>
              <td>{Math.abs(debit - credit) < 0.005 ? <span className="status status-success">Balanced</span> : <span className="status status-warning">Off by {plain(Math.abs(debit - credit))}</span>}</td>
              <td className="num">{plain(debit)}</td>
              <td className="num">{plain(credit)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
        </div>
        <span className="muted" style={{ padding: "0 24px", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Icon name="person" />
          {options && options.secondOver > 0 ? `Over ${money(options.secondOver, options.baseCurrency)}, a second person approves it.` : "It posts as soon as you press Post."}
        </span>
        {needsReason ? (
          <div style={{ padding: "0 24px" }}>
            <Field label="Why it posts into a closed month" htmlFor="journal-override">
              <Input id="journal-override" value={reason} onChange={(event) => setReason(event.target.value)} />
            </Field>
          </div>
        ) : null}
        {error ? (
          <p className="error" role="alert" style={{ padding: "0 24px" }}>
            {error}
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}
