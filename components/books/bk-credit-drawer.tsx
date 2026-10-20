"use client";

import * as React from "react";

import { Banner, Button, Drawer, DrawerSection, Field, Input, Select, TextArea } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { creditNoteBody, creditNoteErrors, type CreditKind } from "@/lib/books/credit-form";
import { money } from "@/lib/books/format";

/** The invoice a credit or write-off is against: what is left on it, and its VAT rate. */
export type CreditTarget = {
  id: string;
  number: string;
  customer: string;
  currency: string;
  /** What is left to credit (total less credits and write-offs), and what is still owed. */
  creditLeft: number;
  balance: number;
  /** The VAT rate the invoice's lines carry, for the credit note's one line. */
  taxRate: number;
  fiscalised?: boolean;
};

/**
 * Credit or write off, from an invoice (books-final §5.1): a credit note for an
 * amount with its reason, posted and fiscalised when the invoice was; or what
 * is left owing written off as a bad debt. With `targets`, the invoice is
 * chosen first (Credit notes → New).
 */
export function CreditDrawer({
  kind,
  target,
  targets,
  open,
  onOpenChange,
  onDone,
}: {
  kind: CreditKind;
  target?: CreditTarget | null;
  targets?: CreditTarget[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: { title: string; description?: string }) => void | Promise<void>;
}) {
  const [chosen, setChosen] = React.useState<string>(target?.id ?? "");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [shown, setShown] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setChosen(target?.id ?? "");
    setAmount(kind === "write-off" && target ? target.balance.toFixed(2) : "");
    setReason("");
    setShown(false);
    setError(null);
  }, [open, kind, target]);

  const invoice = target ?? targets?.find((option) => option.id === chosen) ?? null;
  const errors = shown ? creditNoteErrors(kind, invoice, amount, reason) : {};
  const title = kind === "credit" ? "New credit note" : "Write off";

  const go = async () => {
    setShown(true);
    if (Object.keys(creditNoteErrors(kind, invoice, amount, reason)).length > 0 || !invoice) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "credit") {
        const note = await fetchJson<{ noteNumber: string | null; total: number }>("/api/accounting/sales/credit-notes", {
          method: "POST",
          body: JSON.stringify(creditNoteBody(invoice, amount, reason)),
        });
        await onDone({ title: `${note.noteNumber ?? "The credit note"} credits ${money(note.total, invoice.currency)} on ${invoice.number}`, description: "Posted today." });
      } else {
        const done = await fetchJson<{ writeOffNumber: string | null; amount: number }>("/api/accounting/sales/write-offs", {
          method: "POST",
          body: JSON.stringify({ invoiceId: invoice.id, amount: Number(amount), reason: reason.trim() }),
        });
        await onDone({ title: `${money(done.amount, invoice.currency)} on ${invoice.number} is written off`, description: `${done.writeOffNumber ?? "The write-off"} is posted. Void it to undo.` });
      }
      setBusy(false);
      onOpenChange(false);
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "Nothing was changed. Check the connection and try again."));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={title}
      sub={invoice ? `${invoice.number}, ${invoice.customer}: ${money(invoice.balance, invoice.currency)} owed.` : "Choose the invoice it is against."}
      width={480}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon={kind === "credit" ? "invoice" : "retire"} shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={go}>
            {kind === "credit" ? "Issue the credit note" : "Write it off"}
          </Button>
        </>
      }
    >
      {targets && !target ? (
        <DrawerSection title="Invoice">
          <Field label="Invoice" htmlFor="credit-invoice" error={errors.invoice}>
            <Select id="credit-invoice" value={chosen} onChange={(event) => setChosen(event.target.value)}>
              <option value="">Choose an invoice</option>
              {targets.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.number}, {option.customer}, {money(option.balance, option.currency)}
                </option>
              ))}
            </Select>
          </Field>
        </DrawerSection>
      ) : null}
      <DrawerSection title={kind === "credit" ? "How much" : "What is written off"}>
        <Field
          label={kind === "credit" ? `Amount, with VAT (${invoice?.currency ?? "USD"})` : `Amount (${invoice?.currency ?? "USD"})`}
          htmlFor="credit-amount"
          error={errors.amount}
          help={invoice ? (kind === "credit" ? `Up to ${money(invoice.creditLeft, invoice.currency)}.` : `Up to ${money(invoice.balance, invoice.currency)}, what is still owed.`) : undefined}
        >
          <Input id="credit-amount" inputMode="decimal" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} style={{ maxWidth: 200 }} />
        </Field>
      </DrawerSection>
      <DrawerSection title="Why">
        <Field label="Reason" htmlFor="credit-reason" error={errors.reason}>
          <TextArea
            id="credit-reason"
            rows={2}
            value={reason}
            disabled={busy}
            placeholder={kind === "credit" ? "Two boxes came back unused" : "The customer has closed down"}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {kind === "credit" && invoice?.fiscalised ? (
          <div style={{ marginTop: "var(--space-12)" }}>
            <Banner tone="warning" icon="fiscal">
              {invoice.number} was signed by FDMS, so the credit note is signed too, referencing it.
            </Banner>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="error" style={{ marginTop: "var(--space-8)" }}>
            {error}
          </p>
        ) : null}
      </DrawerSection>
    </Drawer>
  );
}
