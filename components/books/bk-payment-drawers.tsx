"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { todayHarare } from "@/components/books/bk-form";
import { Banner, Button, Check, Drawer, DrawerSection, Field, Input, Select } from "@/components/core";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { BooksFormOptions } from "@/lib/books/form-options-view";
import { money, shortDay } from "@/lib/books/format";
import type { ApplyPaymentResult } from "@/lib/books/payment-apply";
import { allocateOldestFirst, onAccount, paymentFormErrors, readAmount, type Allocation, type OpenInvoice } from "@/lib/books/payment-form";

type PaymentFormOptions = BooksFormOptions & { openInvoices: OpenInvoice[] };
type OpenBill = OpenInvoice & { note: string | null; fti: string | null };
type Approval = { limit: number; owner: string | null; youPay: boolean } | null;
type PaymentOutOptions = BooksFormOptions & { openBills: OpenBill[]; approval: Approval; payFrom: string | null };
type RecordedCustomerPayment = {
  customer: string;
  currency: string;
  receipts: Array<{ id: string; number: string; invoiceId: string | null; amount: number }>;
  onAccount: number;
};

export type UnappliedReceiptTarget = {
  id: string;
  number: string;
  amount: number;
  currency: string;
  customerId: string | null;
  customerName: string | null;
  openInvoices?: OpenInvoice[];
};

function dueLabel(invoice: OpenInvoice): string {
  if (invoice.daysLate > 0) return `${invoice.daysLate} ${invoice.daysLate === 1 ? "day" : "days"} overdue`;
  return invoice.due ? `Due ${shortDay(invoice.due)}` : "No due date";
}

/**
 * In-place drawer to apply an unapplied customer payment ("Money on account")
 * to one or more open invoices without leaving the current page.
 */
export function ApplyPaymentDrawer({
  receipt,
  targetInvoiceId,
  open,
  onOpenChange,
  onDone,
}: {
  receipt: UnappliedReceiptTarget | null;
  targetInvoiceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: (result: ApplyPaymentResult) => void | Promise<void>;
}) {
  const [allocations, setAllocations] = React.useState<Allocation[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const fetched = useQuery({
    queryKey: ["books", "forms", "payment", receipt?.customerId ?? ""],
    queryFn: () => fetchJson<PaymentFormOptions>(`/api/books/forms?for=payment&customer=${receipt?.customerId ?? ""}`),
    enabled: open && Boolean(receipt?.customerId) && !receipt?.openInvoices,
  });

  const invoices = React.useMemo(() => {
    if (!receipt) return [];
    const list = receipt.openInvoices ?? fetched.data?.openInvoices ?? [];
    return list.filter((inv) => inv.currency.toUpperCase() === receipt.currency.toUpperCase() && inv.balance > 0.005);
  }, [receipt, fetched.data]);

  React.useEffect(() => {
    if (!open || !receipt) return;
    setError(null);
    if (invoices.length === 0) {
      setAllocations([]);
      return;
    }
    if (targetInvoiceId) {
      const target = invoices.find((inv) => inv.id === targetInvoiceId);
      if (target) {
        setAllocations([{ invoiceId: target.id, amount: Math.round(Math.min(receipt.amount, target.balance) * 100) / 100 }]);
        return;
      }
    }
    setAllocations(allocateOldestFirst(receipt.amount, invoices));
  }, [open, receipt, invoices, targetInvoiceId]);

  const appliedTotal = Math.round(allocations.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
  const remainingCredit = receipt ? Math.max(0, Math.round((receipt.amount - appliedTotal) * 100) / 100) : 0;

  const setInvoiceAllocation = (invoiceId: string, nextAmount: number | null) => {
    setError(null);
    setAllocations((current) => {
      const others = current.filter((row) => row.invoiceId !== invoiceId);
      if (nextAmount === null || nextAmount <= 0) return others;
      return [...others, { invoiceId, amount: Math.round(nextAmount * 100) / 100 }];
    });
  };

  const submit = async () => {
    if (!receipt) return;
    const valid = allocations.filter((row) => row.amount > 0.005);
    if (valid.length === 0) {
      setError("Tick at least one invoice to apply this credit to.");
      return;
    }
    if (appliedTotal > receipt.amount + 0.005) {
      setError(`You can apply at most ${money(receipt.amount, receipt.currency)} from ${receipt.number}.`);
      return;
    }
    for (const row of valid) {
      const inv = invoices.find((candidate) => candidate.id === row.invoiceId);
      if (inv && row.amount > inv.balance + 0.005) {
        setError(`${inv.number} only has ${money(inv.balance, receipt.currency)} left to pay.`);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const done = await fetchJson<ApplyPaymentResult>(`/api/books/payments/${receipt.id}`, {
        method: "PATCH",
        body: JSON.stringify({ allocations: valid }),
      });
      setBusy(false);
      onOpenChange(false);
      await onDone(done);
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "Could not apply the payment. Check the connection and try again."));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={receipt ? `Apply ${receipt.number} to an invoice` : "Apply payment to an invoice"}
      sub={
        receipt
          ? `${money(receipt.amount, receipt.currency)} of unused credit${receipt.customerName ? ` for ${receipt.customerName}` : ""}.`
          : undefined
      }
      width={540}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="check"
            shortcut="Ctrl ↵"
            busy={busy}
            disabled={busy || invoices.length === 0 || appliedTotal <= 0}
            onClick={submit}
          >
            {appliedTotal > 0 && receipt ? `Apply ${money(appliedTotal, receipt.currency)}` : "Apply to invoice"}
          </Button>
        </>
      }
    >
      {!receipt ? null : !receipt.customerId ? (
        <DrawerSection title="No customer linked">
          <p className="muted" style={{ margin: 0 }}>
            This payment does not have a customer linked to it yet.
          </p>
        </DrawerSection>
      ) : fetched.isLoading && !receipt.openInvoices ? (
        <DrawerSection title="Open invoices">
          <p className="muted" style={{ margin: 0 }}>
            Loading open invoices for {receipt.customerName ?? "customer"}…
          </p>
        </DrawerSection>
      ) : invoices.length === 0 ? (
        <DrawerSection title="No unpaid invoices">
          <p className="muted" style={{ margin: 0 }}>
            {receipt.customerName ?? "This customer"} has no unpaid {receipt.currency} invoices right now. Issue an invoice first, then apply this credit to it.
          </p>
        </DrawerSection>
      ) : (
        <>
          <DrawerSection title="Choose which invoices to pay with this credit">
            <div className="bk-bleed">
              <table className="table" aria-label="Unpaid invoices">
                <colgroup>
                  <col style={{ width: 40 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 140 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th />
                    <th>Invoice</th>
                    <th className="num">Left to pay</th>
                    <th className="num">Apply now</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const row = allocations.find((a) => a.invoiceId === inv.id);
                    const ticked = Boolean(row && row.amount > 0);
                    return (
                      <tr key={inv.id} aria-selected={ticked || undefined}>
                        <td className="check">
                          <Check
                            aria-label={`Apply to ${inv.number}`}
                            checked={ticked}
                            onCheckedChange={() => {
                              if (ticked) {
                                setInvoiceAllocation(inv.id, null);
                              } else {
                                const usedElsewhere = allocations
                                  .filter((a) => a.invoiceId !== inv.id)
                                  .reduce((sum, a) => sum + a.amount, 0);
                                const leftInReceipt = Math.max(0, receipt.amount - usedElsewhere);
                                const defaultApply = Math.min(inv.balance, leftInReceipt > 0 ? leftInReceipt : inv.balance);
                                setInvoiceAllocation(inv.id, defaultApply);
                              }
                            }}
                          />
                        </td>
                        <td>
                          <div className="ref">{inv.number}</div>
                          <div className={inv.daysLate > 0 ? "warn" : "muted"} style={{ fontSize: 12 }}>
                            {dueLabel(inv)}
                          </div>
                        </td>
                        <td className="num">{money(inv.balance, receipt.currency)}</td>
                        <td className="num">
                          <Input
                            aria-label={`Amount to apply to ${inv.number}`}
                            className="cell-in num"
                            inputMode="decimal"
                            value={row ? String(row.amount) : ""}
                            placeholder="0.00"
                            disabled={busy}
                            onChange={(event) => {
                              const n = Number(event.target.value);
                              setInvoiceAllocation(inv.id, event.target.value === "" || !Number.isFinite(n) || n <= 0 ? null : n);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </DrawerSection>
          <DrawerSection title="Summary">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-6)", fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="muted">Credit available ({receipt.number})</span>
                <span className="num">{money(receipt.amount, receipt.currency)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 600 }}>
                <span>Applying to invoices now</span>
                <span className="num">{money(appliedTotal, receipt.currency)}</span>
              </div>
              {remainingCredit > 0.005 ? (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--color-ink-2)" }}>
                  <span>Stays on account as credit</span>
                  <span className="num">{money(remainingCredit, receipt.currency)}</span>
                </div>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="error" style={{ marginTop: "var(--space-10)" }}>
                {error}
              </p>
            ) : null}
          </DrawerSection>
        </>
      )}
    </Drawer>
  );
}

/**
 * In-place drawer to record a customer payment received without navigating away
 * from the invoice, customer, or payments list page.
 */
export function RecordCustomerPaymentDrawer({
  open,
  onOpenChange,
  initialCustomerId,
  initialInvoice,
  unappliedReceipts,
  onUseCreditInstead,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCustomerId?: string;
  initialInvoice?: { id: string; number: string; customerId: string; customerName: string; balance: number; currency: string } | null;
  unappliedReceipts?: Array<{ id: string; number: string; amount: number; currency: string; date: string }>;
  onUseCreditInstead?: (receiptId: string) => void;
  onDone: (recorded: RecordedCustomerPayment) => void | Promise<void>;
}) {
  const lockedCustomerId = initialInvoice?.customerId ?? initialCustomerId ?? "";
  const [customerId, setCustomerId] = React.useState(lockedCustomerId);
  const [currency, setCurrency] = React.useState(initialInvoice?.currency ?? "USD");
  const [amountText, setAmountText] = React.useState(initialInvoice ? initialInvoice.balance.toFixed(2) : "");
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState(todayHarare());
  const [reference, setReference] = React.useState("");
  const [allocations, setAllocations] = React.useState<Allocation[]>([]);
  const [byHand, setByHand] = React.useState(false);
  const [shown, setShown] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const baseOptions = useQuery({
    queryKey: ["books", "forms", "payment"],
    queryFn: () => fetchJson<BooksFormOptions>("/api/books/forms?for=payment"),
    enabled: open,
  });

  const customerOptions = useQuery({
    queryKey: ["books", "forms", "payment", customerId],
    queryFn: () => fetchJson<PaymentFormOptions>(`/api/books/forms?for=payment&customer=${customerId}`),
    enabled: open && Boolean(customerId),
  });

  const accounts = React.useMemo(
    () => (baseOptions.data?.accounts ?? []).filter((acc) => acc.currency.toUpperCase() === currency.toUpperCase()),
    [baseOptions.data, currency],
  );

  const openInvoices = React.useMemo(
    () => (customerOptions.data?.openInvoices ?? []).filter((inv) => inv.currency.toUpperCase() === currency.toUpperCase()),
    [customerOptions.data, currency],
  );

  // Reset form when drawer opens
  React.useEffect(() => {
    if (!open) return;
    const nextCustomer = initialInvoice?.customerId ?? initialCustomerId ?? "";
    const nextCurrency = initialInvoice?.currency ?? baseOptions.data?.base ?? "USD";
    setCustomerId(nextCustomer);
    setCurrency(nextCurrency);
    setAmountText(initialInvoice ? initialInvoice.balance.toFixed(2) : "");
    setReceivedAt(todayHarare());
    setReference(initialInvoice ? initialInvoice.number : "");
    setByHand(false);
    setShown(false);
    setError(null);
  }, [open, initialInvoice, initialCustomerId, baseOptions.data?.base]);

  // Auto-select the first matching bank/cash/mobile account for the selected currency
  React.useEffect(() => {
    if (!open) return;
    if (accounts.length > 0 && !accounts.some((acc) => acc.id === bankAccountId)) {
      setBankAccountId(accounts[0]!.id);
    } else if (accounts.length === 0) {
      setBankAccountId("");
    }
  }, [open, accounts, bankAccountId]);

  const numericAmount = readAmount(amountText || "0");

  // Auto-allocate oldest first (prioritizing initialInvoice when present)
  React.useEffect(() => {
    if (!open || byHand) return;
    if (initialInvoice && openInvoices.length === 0) {
      const cap = Math.round(Math.min(Number.isFinite(numericAmount) ? Math.max(0, numericAmount) : 0, initialInvoice.balance) * 100) / 100;
      setAllocations(cap > 0 ? [{ invoiceId: initialInvoice.id, amount: cap }] : []);
      return;
    }
    const preferred = initialInvoice ? openInvoices.filter((inv) => inv.id === initialInvoice.id) : [];
    const ordered = preferred.length ? [...preferred, ...openInvoices.filter((inv) => inv.id !== initialInvoice?.id)] : openInvoices;
    setAllocations(allocateOldestFirst(Number.isFinite(numericAmount) ? numericAmount : 0, ordered));
  }, [open, numericAmount, openInvoices, byHand, initialInvoice]);

  const formState = {
    customerId,
    bankAccountId,
    receivedAt,
    currency,
    amount: amountText,
    reference,
    allocations,
  };
  const invoicePoolForValidation: OpenInvoice[] =
    openInvoices.length > 0
      ? openInvoices
      : initialInvoice
        ? [{ id: initialInvoice.id, number: initialInvoice.number, due: null, daysLate: 0, balance: initialInvoice.balance, currency: initialInvoice.currency }]
        : [];
  const fieldErrors = shown ? paymentFormErrors(formState, invoicePoolForValidation) : {};
  const restOnAccount = Number.isFinite(numericAmount) ? onAccount(numericAmount, allocations) : 0;

  const submit = async () => {
    setShown(true);
    const currentErrors = paymentFormErrors(formState, invoicePoolForValidation);
    if (Object.keys(currentErrors).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const done = await fetchJson<RecordedCustomerPayment>("/api/books/payments", {
        method: "POST",
        body: JSON.stringify({
          customerId,
          bankAccountId,
          receivedAt,
          currency,
          amount: numericAmount,
          ...(reference.trim() ? { reference: reference.trim() } : {}),
          allocations,
        }),
      });
      setBusy(false);
      onOpenChange(false);
      await onDone(done);
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "Could not record the payment. Check the connection and try again."));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={initialInvoice ? `Record payment for ${initialInvoice.number}` : "Record a customer payment"}
      sub={
        initialInvoice
          ? `${initialInvoice.customerName} · ${money(initialInvoice.balance, initialInvoice.currency)} left to pay`
          : "Record money received from a customer into your bank, mobile money, or cash."
      }
      width={520}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="check" shortcut="Ctrl ↵" busy={busy} disabled={busy} onClick={submit}>
            {Number.isFinite(numericAmount) && numericAmount > 0 ? `Save ${money(numericAmount, currency)} payment` : "Save payment"}
          </Button>
        </>
      }
    >
      {unappliedReceipts && unappliedReceipts.length > 0 && onUseCreditInstead ? (
        <DrawerSection title="Unused credit available">
          <Banner icon="payments">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
              <span>
                <b>{initialInvoice?.customerName ?? "This customer"}</b> already has{" "}
                <b>{money(unappliedReceipts.reduce((s, r) => s + r.amount, 0), unappliedReceipts[0]!.currency)}</b> of unused credit on account ({unappliedReceipts.map((r) => r.number).join(", ")}).
              </span>
              <div>
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    onUseCreditInstead(unappliedReceipts[0]!.id);
                  }}
                >
                  Use existing credit instead
                </Button>
              </div>
            </div>
          </Banner>
        </DrawerSection>
      ) : null}

      <DrawerSection title="Payment details">
        {!initialInvoice ? (
          <Field label="Who paid you?" htmlFor="rcp-customer" error={fieldErrors.customerId}>
            <Select
              id="rcp-customer"
              value={customerId}
              disabled={busy || Boolean(initialCustomerId)}
              onChange={(event) => {
                setCustomerId(event.target.value);
                setByHand(false);
              }}
            >
              <option value="">Choose a customer…</option>
              {(baseOptions.data?.parties ?? []).map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: initialInvoice ? "1fr 1fr" : "120px 1fr 1fr", gap: "var(--space-12)" }}>
          {!initialInvoice ? (
            <Field label="Currency" htmlFor="rcp-currency">
              <Select
                id="rcp-currency"
                value={currency}
                disabled={busy}
                onChange={(event) => {
                  setCurrency(event.target.value);
                  setByHand(false);
                }}
              >
                {(baseOptions.data?.currencies ?? ["USD", "ZWG"]).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <Field
            label={`How much did they pay? (${currency})`}
            htmlFor="rcp-amount"
            error={fieldErrors.amount}
            help={initialInvoice ? `Full balance is ${money(initialInvoice.balance, currency)}. Enter less for a part-payment.` : undefined}
          >
            <Input
              id="rcp-amount"
              inputMode="decimal"
              value={amountText}
              disabled={busy}
              placeholder="0.00"
              onChange={(event) => setAmountText(event.target.value)}
            />
          </Field>

          <Field label="Date received" htmlFor="rcp-date">
            <Input id="rcp-date" type="date" value={receivedAt} disabled={busy} onChange={(event) => setReceivedAt(event.target.value)} />
          </Field>
        </div>

        <Field
          label="Paid into (Bank, Mobile Money, or Cash)"
          htmlFor="rcp-account"
          error={fieldErrors.bankAccountId}
          help="Which business account or cash till received this money?"
        >
          <Select id="rcp-account" value={bankAccountId} disabled={busy} onChange={(event) => setBankAccountId(event.target.value)}>
            {accounts.length === 0 ? <option value="">No {currency} account found</option> : null}
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.label} ({acc.kind === "CASH" ? "Cash" : acc.kind === "MOBILE" ? "Mobile money" : "Bank"})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Reference or receipt note (optional)" htmlFor="rcp-ref" help="E.g. EcoCash approval code, bank transfer ref, or receipt book number.">
          <Input
            id="rcp-ref"
            value={reference}
            disabled={busy}
            placeholder="Optional reference…"
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
      </DrawerSection>

      {!initialInvoice && customerId && openInvoices.length > 0 ? (
        <DrawerSection title="Which invoices does this pay?">
          <p className="muted" style={{ margin: "0 0 var(--space-8)", fontSize: 12 }}>
            Automatically applied to the oldest invoice first. Untick all to keep the money on account as customer credit.
          </p>
          <div className="bk-bleed">
            <table className="table" aria-label="Customer open invoices">
              <colgroup>
                <col style={{ width: 40 }} />
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th />
                  <th>Invoice</th>
                  <th className="num">Left to pay</th>
                  <th className="num">This payment</th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv) => {
                  const row = allocations.find((a) => a.invoiceId === inv.id);
                  const ticked = Boolean(row && row.amount > 0);
                  return (
                    <tr key={inv.id} aria-selected={ticked || undefined}>
                      <td className="check">
                        <Check
                          aria-label={`Apply to ${inv.number}`}
                          checked={ticked}
                          onCheckedChange={() => {
                            setByHand(true);
                            setAllocations((curr) => {
                              const others = curr.filter((a) => a.invoiceId !== inv.id);
                              if (ticked) return others;
                              const used = others.reduce((s, a) => s + a.amount, 0);
                              const avail = Math.max(0, (Number.isFinite(numericAmount) ? numericAmount : 0) - used);
                              const take = Math.min(inv.balance, avail > 0 ? avail : inv.balance);
                              return [...others, { invoiceId: inv.id, amount: Math.round(take * 100) / 100 }];
                            });
                          }}
                        />
                      </td>
                      <td>
                        <div className="ref">{inv.number}</div>
                        <div className={inv.daysLate > 0 ? "warn" : "muted"} style={{ fontSize: 12 }}>
                          {dueLabel(inv)}
                        </div>
                      </td>
                      <td className="num">{money(inv.balance, currency)}</td>
                      <td className="num">
                        <Input
                          aria-label={`Amount for ${inv.number}`}
                          className="cell-in num"
                          inputMode="decimal"
                          value={row ? String(row.amount) : ""}
                          placeholder="0.00"
                          disabled={busy}
                          onChange={(event) => {
                            setByHand(true);
                            const n = Number(event.target.value);
                            setAllocations((curr) => {
                              const others = curr.filter((a) => a.invoiceId !== inv.id);
                              if (!event.target.value || !Number.isFinite(n) || n <= 0) return others;
                              return [...others, { invoiceId: inv.id, amount: Math.round(n * 100) / 100 }];
                            });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {restOnAccount > 0.005 ? (
            <p className="muted" style={{ margin: "var(--space-8) 0 0", fontSize: 12 }}>
              <b>{money(restOnAccount, currency)}</b> is not linked to an invoice yet and will stay on account as credit.
            </p>
          ) : null}
        </DrawerSection>
      ) : null}

      {fieldErrors.allocations || error ? (
        <DrawerSection title="Check payment">
          <p role="alert" className="error" style={{ margin: 0 }}>
            {fieldErrors.allocations ?? error}
          </p>
        </DrawerSection>
      ) : null}
    </Drawer>
  );
}

export type BillToPayTarget = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  balance: number;
  currency: string;
};

/**
 * In-place drawer to pay one or more supplier bills directly from the Bill detail
 * or Bills list page with zero redirects.
 */
export function PayBillDrawer({
  open,
  onOpenChange,
  bills,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bills: BillToPayTarget[];
  onDone: (message: { title: string; description?: string }) => void | Promise<void>;
}) {
  const first = bills[0] ?? null;
  const vendorId = first?.supplierId ?? "";
  const currency = first?.currency ?? "USD";

  const [bankAccountId, setBankAccountId] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(todayHarare());
  const [reference, setReference] = React.useState("");
  const [amounts, setAmounts] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const options = useQuery({
    queryKey: ["books", "forms", "payment-out", vendorId],
    queryFn: () => fetchJson<PaymentOutOptions>(`/api/books/forms?for=payment-out&supplier=${vendorId}`),
    enabled: open && Boolean(vendorId),
  });

  const matchingAccounts = React.useMemo(
    () => (options.data?.accounts ?? []).filter((acc) => acc.currency.toUpperCase() === currency.toUpperCase()),
    [options.data, currency],
  );

  React.useEffect(() => {
    if (!open) return;
    setPaidAt(todayHarare());
    setReference(bills.length === 1 ? bills[0]!.number : "");
    setAmounts(Object.fromEntries(bills.map((b) => [b.id, b.balance.toFixed(2)])));
    setError(null);
  }, [open, bills]);

  React.useEffect(() => {
    if (!open) return;
    const preferred = options.data?.payFrom;
    if (preferred && matchingAccounts.some((acc) => acc.id === preferred)) {
      setBankAccountId(preferred);
    } else if (matchingAccounts.length > 0 && !matchingAccounts.some((acc) => acc.id === bankAccountId)) {
      setBankAccountId(matchingAccounts[0]!.id);
    }
  }, [open, options.data?.payFrom, matchingAccounts, bankAccountId]);

  const parsedLines = bills.map((b) => ({
    bill: b,
    amount: Math.round((Number(amounts[b.id] ?? 0) || 0) * 100) / 100,
  }));
  const total = Math.round(parsedLines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100;
  const approval = options.data?.approval ?? null;
  const needsOwnerApproval = Boolean(approval && !approval.youPay && total > approval.limit + 0.004);

  const submit = async () => {
    if (!first) return;
    if (!bankAccountId) {
      setError("Choose which bank, mobile money, or cash account this payment leaves from.");
      return;
    }
    const activeLines = parsedLines.filter((l) => l.amount > 0.005);
    if (activeLines.length === 0) {
      setError("Enter a payment amount greater than zero.");
      return;
    }
    for (const l of activeLines) {
      if (l.amount > l.bill.balance + 0.005) {
        setError(`${l.bill.number} only has ${money(l.bill.balance, currency)} left to pay.`);
        return;
      }
    }

    setBusy(true);
    setError(null);
    try {
      if (needsOwnerApproval) {
        await fetchJson("/api/books/payments-made/drafts", {
          method: "POST",
          body: JSON.stringify({
            vendorId,
            bankAccountId,
            paidAt,
            send: true,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            bills: activeLines.map((l) => ({ billId: l.bill.id, amount: l.amount })),
          }),
        });
        setBusy(false);
        onOpenChange(false);
        await onDone({
          title: `Payment of ${money(total, currency)} sent for approval`,
          description: `Over your limit of ${money(approval!.limit, currency)}. ${approval?.owner ?? "The owner"} can approve it.`,
        });
      } else {
        await fetchJson("/api/books/payments-made", {
          method: "POST",
          body: JSON.stringify({
            vendorId,
            bankAccountId,
            paidAt,
            ...(reference.trim() ? { reference: reference.trim() } : {}),
            bills: activeLines.map((l) => ({ billId: l.bill.id, amount: l.amount })),
          }),
        });
        setBusy(false);
        onOpenChange(false);
        await onDone({
          title: `Paid ${money(total, currency)} to ${first.supplierName}`,
          description: activeLines.length === 1 ? `${activeLines[0]!.bill.number} is updated.` : `${activeLines.length} bills updated.`,
        });
      }
    } catch (caught) {
      setBusy(false);
      setError(getApiErrorMessage(caught, "Could not record the payment. Check the connection and try again."));
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={bills.length === 1 ? `Pay ${bills[0]!.number}` : `Pay ${bills.length} bills`}
      sub={first ? `${first.supplierName} · ${money(total, currency)}` : undefined}
      width={500}
      footer={
        <>
          <Button disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon="payments" shortcut="Ctrl ↵" busy={busy} disabled={busy || total <= 0} onClick={submit}>
            {needsOwnerApproval ? `Send ${money(total, currency)} for approval` : `Record ${money(total, currency)} payment`}
          </Button>
        </>
      }
    >
      <DrawerSection title="Payment details">
        <Field
          label="Paid from (Bank, Mobile Money, or Cash)"
          htmlFor="pay-bill-account"
          help="Which business account or cash float did the money leave from?"
        >
          <Select id="pay-bill-account" value={bankAccountId} disabled={busy} onChange={(event) => setBankAccountId(event.target.value)}>
            {matchingAccounts.length === 0 ? <option value="">No {currency} account found</option> : null}
            {matchingAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.label} ({acc.kind === "CASH" ? "Cash" : acc.kind === "MOBILE" ? "Mobile money" : "Bank"})
              </option>
            ))}
          </Select>
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: bills.length === 1 ? "1fr 1fr" : "1fr", gap: "var(--space-12)" }}>
          {bills.length === 1 ? (
            <Field
              label={`Amount paid (${currency})`}
              htmlFor="pay-bill-amount"
              help={`Balance owing is ${money(bills[0]!.balance, currency)}.`}
            >
              <Input
                id="pay-bill-amount"
                inputMode="decimal"
                value={amounts[bills[0]!.id] ?? ""}
                disabled={busy}
                onChange={(event) => setAmounts({ [bills[0]!.id]: event.target.value })}
              />
            </Field>
          ) : null}

          <Field label="Date paid" htmlFor="pay-bill-date">
            <Input id="pay-bill-date" type="date" value={paidAt} disabled={busy} onChange={(event) => setPaidAt(event.target.value)} />
          </Field>
        </div>

        <Field label="Reference or receipt number (optional)" htmlFor="pay-bill-ref" help="E.g. bank transfer reference, EcoCash code, or receipt number.">
          <Input
            id="pay-bill-ref"
            value={reference}
            disabled={busy}
            placeholder="Optional reference…"
            onChange={(event) => setReference(event.target.value)}
          />
        </Field>
      </DrawerSection>

      {bills.length > 1 ? (
        <DrawerSection title="Bills being paid">
          <div className="bk-bleed">
            <table className="table" aria-label="Bills being paid">
              <colgroup>
                <col />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Bill</th>
                  <th className="num">Balance</th>
                  <th className="num">Pay now</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <span className="ref">{b.number}</span>
                    </td>
                    <td className="num">{money(b.balance, currency)}</td>
                    <td className="num">
                      <Input
                        aria-label={`Amount for ${b.number}`}
                        className="cell-in num"
                        inputMode="decimal"
                        value={amounts[b.id] ?? ""}
                        disabled={busy}
                        onChange={(event) => setAmounts((curr) => ({ ...curr, [b.id]: event.target.value }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DrawerSection>
      ) : null}

      {needsOwnerApproval ? (
        <DrawerSection title="Approval required">
          <Banner icon="warn">
            This payment is above your direct payment limit of {money(approval!.limit, currency)}. Saving it will send it to {approval?.owner ?? "the owner"} for 1-click approval.
          </Banner>
        </DrawerSection>
      ) : null}

      {error ? (
        <DrawerSection title="Check payment">
          <p role="alert" className="error" style={{ margin: 0 }}>
            {error}
          </p>
        </DrawerSection>
      ) : null}
    </Drawer>
  );
}
