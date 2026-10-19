"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Banner, Button, Drawer, DrawerSection, Field, Input, Segmented, TextArea } from "@/components/core";
import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import type { InvoiceRecordPage } from "@/lib/books/invoice-record";
import { creditLines, deleteAsk, fiscalNote, REASON_MAX, REASON_MIN, type CreditChoice } from "@/lib/books/reversal";

/** What the server answers once an invoice is deleted. */
export type InvoiceDeleted = { deleted: string; draft: boolean; onAccount: Array<{ id: string; number: string; amount: number }> };

/**
 * Delete, from the invoice's page or its row in Invoices: one action that
 * adapts. A draft goes with one press; anything else names what goes with it
 * and needs a reason and its number typed (`deleteAsk`). It reads the invoice
 * when it opens, so the row menu can use it too.
 */
export function InvoiceDeleteDialog({
  invoiceId,
  number,
  open,
  onOpenChange,
  onDeleted,
}: {
  invoiceId: string;
  number: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: (done: InvoiceDeleted) => void | Promise<void>;
}) {
  const record = useQuery({
    queryKey: ["books", "invoice", invoiceId],
    queryFn: () => fetchJson<InvoiceRecordPage>(`/api/books/invoices/${invoiceId}`),
    enabled: open && Boolean(invoiceId),
  });
  const removal = record.data?.removal ?? null;
  const ask = removal
    ? deleteAsk(removal, record.data!.customer.name)
    : record.isError || (record.data && !removal)
      ? { title: `${number} can't be deleted here`, body: record.isError ? "It did not load. Close this and try again." : "Only the workspace's owner can delete an invoice that was issued.", keep: "Close", go: "", fill: "bad" as const }
      : { title: `Delete ${number}?`, body: "Reading what goes with it.", keep: "Keep it", go: "", fill: "bad" as const };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      ask={ask}
      onConfirm={async (reason) => {
        let done: InvoiceDeleted;
        try {
          done = await fetchJson<InvoiceDeleted>(`/api/books/invoices/${invoiceId}`, {
            method: "DELETE",
            body: JSON.stringify(removal?.draft ? {} : { reason, confirm: removal?.number }),
          });
        } catch (error) {
          throw new Error(getApiErrorMessage(error, "It was not deleted. Check the connection and try again."));
        }
        await onDeleted(done);
      }}
    />
  );
}

export type InvoiceReversed =
  | { how: "void"; number: string; customer: string; unlinked: Array<{ id: string; number: string; amount: number }>; fiscalised: boolean; fiscalSent?: boolean }
  | { how: "credit"; number: string; note: string; total: number; currency: string; fiscalised: boolean; fiscalSent?: boolean };

type How = "void" | "credit";
type CreditBy = "lines" | "amount";

const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ""));

/**
 * Reverse, on an issued or paid invoice's page (the owner's): void the whole
 * of it, or credit part of it with a credit note, for chosen lines or an
 * amount. Either way a reason is asked and kept, and what happens to the
 * payments and the fiscal device is said before anything is done.
 */
export function ReverseDrawer({
  record,
  open,
  onOpenChange,
  onDone,
}: {
  record: InvoiceRecordPage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (done: InvoiceReversed) => void | Promise<void>;
}) {
  const [how, setHow] = React.useState<How>("void");
  const [by, setBy] = React.useState<CreditBy>("lines");
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) return;
    setHow("void");
    setBy("lines");
    setQuantities({});
    setAmount("");
    setReason("");
    setReasonError(null);
    setError(null);
  }, [open]);

  const { currency, number } = record;
  const choice: CreditChoice =
    by === "amount"
      ? { amount: Number(amount) || 0 }
      : { lines: Object.entries(quantities).map(([lineId, value]) => ({ lineId, quantity: Number(value) || 0 })) };
  const credit = how === "credit" ? creditLines(number, record.creditable, choice) : null;
  const creditTotal = credit && "total" in credit ? credit.total : 0;
  const over = how === "credit" && creditTotal > record.creditLeft + 0.005;

  const go = async () => {
    if (reason.trim().length < REASON_MIN) {
      setReasonError("Say why, in a few words.");
      return;
    }
    if (credit && "error" in credit) {
      setError(credit.error);
      return;
    }
    if (over) {
      setError(`${money(creditTotal, currency)} is more than is left to credit (${money(record.creditLeft, currency)}).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const done = await fetchJson<InvoiceReversed>(`/api/books/invoices/${record.id}/reverse`, {
        method: "POST",
        body: JSON.stringify(how === "void" ? { how, reason } : { how, reason, ...choice }),
      });
      setBusy(false);
      onOpenChange(false);
      await onDone(done);
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "It was not reversed. Nothing was changed; try again."));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={`Reverse ${number}`}
      sub={`${money(record.total, currency)} to ${record.customer.name}, ${record.state.label.toLowerCase()}.`}
      width={520}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          {how === "void" ? (
            <Button variant="danger" icon="x" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={go}>
              Void {number}
            </Button>
          ) : (
            <Button variant="primary" icon="invoice" shortcut="Ctrl ↵" busy={busy} disabled={busy || creditTotal <= 0 || over} onClick={go}>
              {creditTotal > 0 ? `Credit ${money(creditTotal, currency)}` : "Credit it"}
            </Button>
          )}
        </>
      }
    >
      <DrawerSection title="How">
        <Segmented<How>
          label="How to reverse it"
          value={how}
          onChange={(next) => {
            setHow(next);
            setError(null);
          }}
          items={[
            { value: "void", label: "Void the whole invoice" },
            { value: "credit", label: "Credit part of it" },
          ]}
        />
        {how === "void" ? (
          <p style={{ margin: "var(--space-12) 0 0" }}>
            {number} becomes void and its {money(record.total, currency)} comes off the books, dated today. It stays in Invoices, marked void.
          </p>
        ) : (
          <p style={{ margin: "var(--space-12) 0 0" }}>
            A credit note for what you choose, posted today against {number}. {money(record.creditLeft, currency)} is left to credit.
          </p>
        )}
      </DrawerSection>

      {how === "credit" ? (
        <DrawerSection title="What to credit">
          <Segmented<CreditBy>
            label="Credit by"
            value={by}
            onChange={(next) => {
              setBy(next);
              setError(null);
            }}
            items={[
              { value: "lines", label: "Chosen lines" },
              { value: "amount", label: "An amount" },
            ]}
          />
          {by === "lines" ? (
            <table className="table" style={{ marginTop: "var(--space-12)" }}>
              <colgroup>
                <col style={{ width: "100%" }} />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="num">Invoiced</th>
                  <th className="num">Credit</th>
                </tr>
              </thead>
              <tbody>
                {record.creditable.map((line) => (
                  <tr key={line.id}>
                    <td className="fill">
                      <span className="cell-lead truncate" title={line.description}>
                        {line.description}
                      </span>
                    </td>
                    <td className="num">
                      {qty(line.quantity)} at {money(line.unitPrice, currency)}
                    </td>
                    <td className="num">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={line.quantity}
                        step="any"
                        aria-label={`How many of ${line.description} to credit`}
                        placeholder="0"
                        value={quantities[line.id] ?? ""}
                        disabled={busy}
                        onChange={(event) => setQuantities((now) => ({ ...now, [line.id]: event.target.value }))}
                        style={{ width: 88, textAlign: "right" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ marginTop: "var(--space-12)" }}>
              <Field label={`Amount, with VAT (${currency})`} htmlFor="reverse-amount" help={`Up to ${money(record.creditLeft, currency)}.`}>
                <Input
                  id="reverse-amount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={amount}
                  disabled={busy}
                  onChange={(event) => setAmount(event.target.value)}
                  style={{ maxWidth: 200 }}
                />
              </Field>
            </div>
          )}
          {creditTotal > 0 ? (
            <p className="muted" style={{ margin: "var(--space-8) 0 0" }}>
              The credit note comes to {money(creditTotal, currency)} with VAT.
            </p>
          ) : null}
        </DrawerSection>
      ) : null}

      <DrawerSection title="What else happens">
        <ul style={{ margin: 0, paddingLeft: "var(--space-16)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {how === "void" ? (
            <li>
              {record.paid > 0.005
                ? `The ${money(record.paid, currency)} paid on it stays as ${record.customer.name}'s money on account, for a later invoice or a refund.`
                : "Nothing was paid on it."}
            </li>
          ) : (
            <li>
              {record.paid > 0.005
                ? `What was paid stays on it; anything over what is now owed is ${record.customer.name}'s money on account.`
                : `What ${record.customer.name} owes drops by the credit.`}
            </li>
          )}
          <li>The reason is kept with the invoice, with your name and the time.</li>
        </ul>
        {record.fiscalised ? (
          <div style={{ marginTop: "var(--space-12)" }}>
            <Banner tone="warning" icon="fiscal">
              {fiscalNote(number)}
            </Banner>
          </div>
        ) : null}
      </DrawerSection>

      <DrawerSection title="Why">
        <Field label="Reason" htmlFor="reverse-reason" error={reasonError}>
          <TextArea
            id="reverse-reason"
            rows={2}
            required
            maxLength={REASON_MAX}
            placeholder={how === "void" ? "Raised against the wrong customer" : "Two rolls came back unused"}
            value={reason}
            disabled={busy}
            onChange={(event) => {
              setReason(event.target.value);
              if (reasonError) setReasonError(null);
            }}
          />
        </Field>
        {error ? (
          <p role="alert" className="error" style={{ marginTop: "var(--space-8)" }}>
            {error}
          </p>
        ) : null}
      </DrawerSection>
    </Drawer>
  );
}
