"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Banner, Button, Drawer, DrawerSection, Field, TextArea } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money } from "@/lib/books/format";
import { receiptFiscalNote, REASON_MAX, REASON_MIN } from "@/lib/books/reversal";
import type { ReceiptVoidFacts, ReceiptVoidResult } from "@/lib/books/void-receipt";

/** "$690.00 from Borrowdale Brooke Clinic, on INV-0143, received 2 Oct." */
function receiptLine(facts: ReceiptVoidFacts): string {
  const from = facts.customer ? ` from ${facts.customer}` : "";
  const on = facts.invoice ? `, on ${facts.invoice.number}` : ", on no invoice";
  return `${money(facts.amount, facts.currency)}${from}${on}, received ${facts.received}.`;
}

/**
 * Void, from a payment's row in Books → Payments (the owner's): says what
 * happens to the posting, the invoice it paid, the bank line it was matched to
 * and the fiscal device before anything is done, and asks why. A payment whose
 * invoice sits in a fiscal day still open cannot be voided until the day closes.
 */
export function ReceiptVoidDrawer({
  receiptId,
  number: asked,
  open,
  onOpenChange,
  onDone,
}: {
  receiptId: string;
  number: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (done: ReceiptVoidResult) => void | Promise<void>;
}) {
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const facts = useQuery({
    queryKey: ["books", "payment-void", receiptId],
    queryFn: () => fetchJson<ReceiptVoidFacts>(`/api/books/payments/${receiptId}/void`),
    enabled: open && Boolean(receiptId),
  });
  const data = facts.data ?? null;
  const number = data?.number ?? asked;
  const blocked = data ? data.voided !== null || data.fiscalDayOpen !== null : true;

  React.useEffect(() => {
    if (open) return;
    setReason("");
    setReasonError(null);
    setError(null);
  }, [open]);

  const go = async () => {
    if (!data || blocked) return;
    if (reason.trim().length < REASON_MIN) {
      setReasonError("Say why, in a few words.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const done = await fetchJson<ReceiptVoidResult>(`/api/books/payments/${receiptId}/void`, { method: "POST", body: JSON.stringify({ reason }) });
      setBusy(false);
      onOpenChange(false);
      await onDone(done);
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "It was not voided. Nothing was changed; try again."));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={`Void ${number}`}
      sub={data ? receiptLine(data) : facts.isError ? "It did not load." : "Reading the payment."}
      width={520}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant="danger" icon="x" shortcut="Ctrl ↵" busy={busy} disabled={busy || blocked} onClick={go}>
            Void {number}
          </Button>
        </>
      }
    >
      {facts.isError ? (
        <DrawerSection title="It did not load">
          <p style={{ margin: 0 }}>{getApiErrorMessage(facts.error, "Close this and try again.")}</p>
        </DrawerSection>
      ) : !data ? (
        <DrawerSection title="What happens">
          <p className="muted" style={{ margin: 0 }}>
            Reading what it touches.
          </p>
        </DrawerSection>
      ) : data.voided ? (
        <DrawerSection title="Void already">
          <p style={{ margin: 0 }}>
            {number} was voided {data.voided.on}
            {data.voided.by ? ` by ${data.voided.by}` : ""}.{data.voided.reason ? ` ${data.voided.reason}` : ""}
          </p>
        </DrawerSection>
      ) : (
        <>
          {data.fiscalDayOpen !== null && data.invoice ? (
            <DrawerSection title="Not yet">
              <Banner tone="danger" icon="fiscal">
                {data.invoice.number} is on fiscal day {data.fiscalDayOpen}, which is still open, and the day&apos;s Z report counts it. Close the fiscal day in Accounting, then void {number}.
              </Banner>
            </DrawerSection>
          ) : null}
          <DrawerSection title="What happens">
            <ul style={{ margin: 0, paddingLeft: "var(--space-16)", display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
              <li>
                {data.posted
                  ? `Its posting is reversed, dated today: the ${money(data.amount, data.currency)} comes off the bank and is owed again.`
                  : "It was never posted to the ledger, so the ledger does not change."}
              </li>
              {data.invoice ? (
                <li>
                  {Math.abs(data.invoice.owedAfter - data.amount) < 0.005
                    ? `${data.invoice.number} is owed ${money(data.amount, data.currency)} again`
                    : `${data.invoice.number} is owed ${money(data.amount, data.currency)} more, ${money(data.invoice.owedAfter, data.currency)} in all`}
                  {data.invoice.paid ? " and goes back from paid to issued. Its aged debt agrees." : ". Its aged debt agrees."}
                </li>
              ) : (
                <li>
                  It was on no invoice: {data.customer ? `${data.customer}'s` : "the customer's"} money on account drops by {money(data.amount, data.currency)}.
                </li>
              )}
              {data.bankLine ? (
                <li>
                  It was matched to the {data.bankLine.bank} line of {data.bankLine.day}, &ldquo;{data.bankLine.description}&rdquo;. That line is open again in Bank, to match to something else.
                </li>
              ) : null}
              <li>{number} stays in Payments, marked void, with your name, the time and the reason. It counts in no total, and its number is not used again.</li>
            </ul>
            {data.fiscalised && data.invoice ? (
              <div style={{ marginTop: "var(--space-12)" }}>
                <Banner tone="warning" icon="fiscal">
                  {receiptFiscalNote(data.invoice.number)}
                </Banner>
              </div>
            ) : null}
          </DrawerSection>
          <DrawerSection title="Why">
            <Field label="Reason" htmlFor="void-receipt-reason" error={reasonError}>
              <TextArea
                id="void-receipt-reason"
                rows={2}
                required
                maxLength={REASON_MAX}
                placeholder="The transfer bounced"
                value={reason}
                disabled={busy || blocked}
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
        </>
      )}
    </Drawer>
  );
}
