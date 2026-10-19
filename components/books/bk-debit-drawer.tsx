"use client";

import * as React from "react";

import { Button, Drawer, DrawerSection, Field, Input, TextArea } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";

/** The bill a debit note or write-off is against: what is left on it, and its VAT rate. */
export type DebitTarget = { id: string; number: string; supplier: string; currency: string; balance: number; taxRate: number };

/**
 * Debit note or write-off, from a bill (books-final §4.9, Accounting's
 * Purchases did both): a debit note for an amount before VAT with the
 * supplier's credit note reference as its reason, issued and posted; or what
 * is left owing written off. Both go through Accounting's routes, which post
 * through the core.
 */
export function DebitDrawer({
  kind,
  target,
  open,
  onOpenChange,
  onDone,
}: {
  kind: "debit-note" | "write-off";
  target: DebitTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (message: { title: string; description?: string }) => void | Promise<void>;
}) {
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [shown, setShown] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setAmount(kind === "write-off" && target ? target.balance.toFixed(2) : "");
    setReason("");
    setShown(false);
    setError(null);
  }, [open, kind, target]);

  const value = Number(amount.replace(/,/g, ""));
  const gross = kind === "debit-note" && target ? Math.round(value * (1 + target.taxRate / 100) * 100) / 100 : value;
  const errors: Record<string, string> = {};
  if (!(value > 0)) errors.amount = "More than nothing.";
  else if (target && gross > target.balance + 0.005) errors.amount = `At most what is owed, ${money(target.balance, target.currency)}.`;
  if (reason.trim().length < 3) errors.reason = kind === "debit-note" ? "Their credit note number, or why." : "Say why, in a few words.";

  const go = async () => {
    setShown(true);
    if (!target || Object.keys(errors).length) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "debit-note") {
        const note = await fetchJson<{ noteNumber: string | null; total: number }>("/api/accounting/purchases/debit-notes", {
          method: "POST",
          body: JSON.stringify({
            billId: target.id,
            noteDate: new Date().toISOString().slice(0, 10),
            currency: target.currency,
            reason: reason.trim(),
            issueNow: true,
            lines: [{ description: reason.trim(), quantity: 1, unitPrice: value, taxRate: target.taxRate }],
          }),
        });
        await onDone({ title: `${note.noteNumber ?? "The debit note"} takes ${money(note.total, target.currency)} off ${target.number}`, description: "Posted today." });
      } else {
        const done = await fetchJson<{ writeOffNumber: string | null; amount: number }>("/api/accounting/purchases/write-offs", {
          method: "POST",
          body: JSON.stringify({ billId: target.id, amount: value, reason: reason.trim() }),
        });
        await onDone({ title: `${money(done.amount, target.currency)} on ${target.number} is written off`, description: `${done.writeOffNumber ?? "The write-off"} is posted.` });
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
      title={kind === "debit-note" ? "New debit note" : "Write off"}
      sub={target ? `${target.number}, ${target.supplier}: ${money(target.balance, target.currency)} owed.` : undefined}
      width={480}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon={kind === "debit-note" ? "invoice" : "retire"} shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={go}>
            {kind === "debit-note" ? "Issue the debit note" : "Write it off"}
          </Button>
        </>
      }
    >
      <DrawerSection title={kind === "debit-note" ? "How much" : "What is written off"}>
        <Field
          label={kind === "debit-note" ? `Before VAT (${target?.currency ?? "USD"})` : `Amount (${target?.currency ?? "USD"})`}
          htmlFor="debit-amount"
          error={shown ? errors.amount : undefined}
          help={kind === "debit-note" && target && value > 0 ? `${money(gross, target.currency)} with VAT at ${target.taxRate}%.` : undefined}
        >
          <Input id="debit-amount" inputMode="decimal" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value)} style={{ maxWidth: 200 }} />
        </Field>
      </DrawerSection>
      <DrawerSection title="Why">
        <Field label={kind === "debit-note" ? "Their credit note, or the reason" : "Reason"} htmlFor="debit-reason" error={shown ? errors.reason : undefined}>
          <TextArea id="debit-reason" rows={2} value={reason} disabled={busy} placeholder={kind === "debit-note" ? "Credit note CN-118, 4 boxes damaged" : "Agreed with them, small balance"} onChange={(event) => setReason(event.target.value)} />
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
