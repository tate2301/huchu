"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { BkBox, BkField, BkFormPage, BkSeg, FormSec, RailFigure, todayHarare, WideSec } from "@/components/books/bk-form";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Icon, Input, Kit, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money, shortDay } from "@/lib/books/format";
import { currencyWord, type BooksFormOptions } from "@/lib/books/form-options-view";
import { allocateOldestFirst, onAccount, paymentFormErrors, readAmount, type Allocation, type OpenInvoice, type PaymentForm } from "@/lib/books/payment-form";

type Options = BooksFormOptions & { openInvoices: OpenInvoice[] };
type Recorded = { customer: string; currency: string; receipts: Array<{ number: string; invoiceId: string | null; amount: number }>; onAccount: number };

function lateWords(invoice: OpenInvoice): string {
  if (invoice.daysLate > 0) return `${invoice.daysLate} ${invoice.daysLate === 1 ? "day" : "days"} overdue`;
  return invoice.due ? `Due ${shortDay(invoice.due)}` : "No due date";
}

function PaymentFormPage({ options, initialCustomer, initialInvoice }: { options: BooksFormOptions; initialCustomer: string; initialInvoice: string | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = React.useState<PaymentForm>(() => ({
    customerId: initialCustomer,
    bankAccountId: "",
    receivedAt: todayHarare(),
    currency: options.base,
    amount: "",
    reference: "",
    allocations: [],
  }));
  // Allocation follows the amount, oldest first, until the person changes a line by hand.
  const [byHand, setByHand] = React.useState(false);
  const [shown, setShown] = React.useState(false);

  const open = useQuery({
    queryKey: ["books", "forms", "payment", form.customerId],
    queryFn: () => fetchJson<Options>(`/api/books/forms?for=payment&customer=${form.customerId}`),
    enabled: Boolean(form.customerId),
  });
  const invoices = React.useMemo(() => (open.data?.openInvoices ?? []).filter((invoice) => invoice.currency === form.currency), [open.data, form.currency]);
  const amount = readAmount(form.amount || "0");

  React.useEffect(() => {
    if (byHand) return;
    const preferred = initialInvoice ? invoices.filter((invoice) => invoice.id === initialInvoice) : [];
    setForm((current) => ({ ...current, allocations: allocateOldestFirst(Number.isFinite(amount) ? amount : 0, preferred.length ? [...preferred, ...invoices.filter((invoice) => invoice.id !== initialInvoice)] : invoices) }));
  }, [amount, invoices, byHand, initialInvoice]);

  // Coming from an invoice's Record a payment, the amount starts at what it owes.
  React.useEffect(() => {
    if (!initialInvoice || form.amount) return;
    const invoice = open.data?.openInvoices.find((candidate) => candidate.id === initialInvoice);
    if (invoice) setForm((current) => ({ ...current, amount: invoice.balance.toFixed(2), currency: invoice.currency }));
  }, [open.data, initialInvoice, form.amount]);

  const accounts = options.accounts.filter((account) => account.currency === form.currency);
  const customer = options.parties.find((party) => party.id === form.customerId);
  const owed = invoices.reduce((sum, invoice) => sum + invoice.balance, 0);
  const late = invoices.filter((invoice) => invoice.daysLate > 0);
  const rest = Number.isFinite(amount) ? onAccount(amount, form.allocations) : 0;
  const errors = shown ? paymentFormErrors(form, open.data?.openInvoices ?? []) : {};
  const allocated = (id: string) => form.allocations.find((row) => row.invoiceId === id);
  const setAllocation = (id: string, value: number | null) => {
    setByHand(true);
    setForm((current) => {
      const others = current.allocations.filter((row) => row.invoiceId !== id);
      const next: Allocation[] = value === null ? others : [...others, { invoiceId: id, amount: value }];
      return { ...current, allocations: next };
    });
  };

  const record = useMutation({
    mutationFn: () =>
      fetchJson<Recorded>("/api/books/payments", {
        method: "POST",
        body: JSON.stringify({
          customerId: form.customerId,
          bankAccountId: form.bankAccountId,
          receivedAt: form.receivedAt,
          currency: form.currency,
          amount,
          ...(form.reference.trim() ? { reference: form.reference.trim() } : {}),
          allocations: form.allocations,
        }),
      }),
    onSuccess: async (done) => {
      const numbers = done.receipts.map((receipt) => receipt.number);
      toast({
        title: `${money(amount, form.currency)} from ${done.customer} is recorded`,
        description: `${numbers.join(", ")}.${done.onAccount ? ` ${money(done.onAccount, form.currency)} is on their account.` : ""}`,
        variant: "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push("/books/payments");
    },
    onError: (error) => toast({ title: "The payment was not recorded", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const submit = () => {
    setShown(true);
    if (Object.keys(paymentFormErrors(form, open.data?.openInvoices ?? [])).length > 0) return;
    record.mutate();
  };

  const afterInvoices = form.allocations.map((row) => {
    const invoice = invoices.find((candidate) => candidate.id === row.invoiceId);
    return invoice ? ([invoice.number, row.amount >= invoice.balance - 0.005 ? "Paid" : "Part paid"] as [string, string]) : null;
  });

  return (
    <>
      <PageChrome
        title="Record a payment"
        backHref="/books/payments"
        backLabel="Payments received"
        primary={{ label: "Record the payment", icon: "check", shortcut: "Ctrl ↵", onClick: submit, disabled: record.isPending ? "Recording it" : undefined }}
      >
        <Kit contents>
          <Button variant="quiet" onClick={() => router.back()}>
            Cancel
          </Button>
        </Kit>
      </PageChrome>
      <BkFormPage
        rail={
          <>
            <RailFigure
              title="This payment"
              figure={money(Number.isFinite(amount) ? amount : 0, form.currency)}
              rows={[
                ...form.allocations.map((row): [string, string] => [`On ${invoices.find((invoice) => invoice.id === row.invoiceId)?.number ?? "an invoice"}`, money(row.amount, form.currency)]),
                ["On account", money(Math.max(0, rest), form.currency)],
                ["Number", options.nextNumber],
              ]}
            />
            <section>
              <div className="sec-title">After you record it</div>
              <dl className="attrs">
                {afterInvoices.slice(0, 2).map((row) =>
                  row ? (
                    <React.Fragment key={row[0]}>
                      <dt>{row[0]}</dt>
                      <dd>{row[1]}</dd>
                    </React.Fragment>
                  ) : null,
                )}
                <dt>They owe</dt>
                <dd className="num">{money(Math.max(0, owed - form.allocations.reduce((sum, row) => sum + row.amount, 0)), form.currency)}</dd>
                <dt>Bank line</dt>
                <dd>Matched when it arrives</dd>
              </dl>
            </section>
          </>
        }
      >
        <FormSec title="From" text="Who paid.">
          <BkField label="Customer" htmlFor="pay-customer" error={errors.customerId}>
            <Select
              id="pay-customer"
              value={form.customerId}
              onChange={(event) => {
                setByHand(false);
                setForm((current) => ({ ...current, customerId: event.target.value, allocations: [] }));
              }}
            >
              <option value="">Choose a customer</option>
              {options.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </BkField>
          {customer && open.data ? (
            invoices.length ? (
              <BkBox icon="invoice">
                They owe <b>{money(owed, form.currency)}</b> on {invoices.length === 1 ? "1 invoice" : `${invoices.length} invoices`}
                {late.length ? `, ${late.length === invoices.length && late.length === 1 ? `${late[0].daysLate} days late` : `${late.length} late`}` : ""}.
              </BkBox>
            ) : (
              <BkBox icon="check">Nothing is owed in {form.currency}: it all goes on their account.</BkBox>
            )
          ) : null}
        </FormSec>

        <FormSec title="Money" text="Where it went in, and how much.">
          <div className="field-row">
            <BkField label="Into" htmlFor="pay-into" error={errors.bankAccountId}>
              <Select id="pay-into" value={form.bankAccountId} onChange={(event) => setForm((current) => ({ ...current, bankAccountId: event.target.value }))}>
                <option value="">Choose an account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label}
                  </option>
                ))}
              </Select>
            </BkField>
            <BkField label="Date" htmlFor="pay-date" error={errors.receivedAt}>
              <Input id="pay-date" type="date" aria-label="Date" value={form.receivedAt} onChange={(event) => setForm((current) => ({ ...current, receivedAt: event.target.value }))} />
            </BkField>
          </div>
          <div className="field-row">
            <BkField label="Currency">
              <BkSeg
                label="Currency"
                value={form.currency}
                onChange={(code) => {
                  setByHand(false);
                  setForm((current) => ({ ...current, currency: code, bankAccountId: "", allocations: [] }));
                }}
                options={options.currencies.map((code) => ({ value: code, label: code === "ZWG" ? "ZiG" : code }))}
              />
            </BkField>
            <BkField label="Amount" htmlFor="pay-amount" error={errors.amount}>
              <label className="input-wrap">
                <span className="muted">{currencyWord(form.currency)}</span>
                <input id="pay-amount" aria-label="Amount" inputMode="decimal" placeholder="0.00" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} />
              </label>
            </BkField>
          </div>
          <BkField label="Their reference" htmlFor="pay-ref" optional hint="Matched to the bank line when it comes in">
            <Input id="pay-ref" aria-label="Their reference" value={form.reference} onChange={(event) => setForm((current) => ({ ...current, reference: event.target.value }))} />
          </BkField>
        </FormSec>

        <WideSec title="Put it on invoices" text="Oldest first; the rest stays on account.">
          {invoices.length === 0 ? (
            <p className="bk-hint">{form.customerId ? "No open invoice in this currency. It all goes on their account." : "Choose the customer to see what they owe."}</p>
          ) : (
            <table className="table bk-le" aria-label="Put it on invoices">
              <thead>
                <tr>
                  <th className="sel" style={{ width: 36 }} />
                  <th>Invoice</th>
                  <th>Due</th>
                  <th className="num">Owing</th>
                  <th className="num">This payment</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const row = allocated(invoice.id);
                  return (
                    <tr key={invoice.id}>
                      <td className="sel">
                        <label className="check">
                          <input
                            type="checkbox"
                            aria-label={`Pay ${invoice.number}`}
                            checked={Boolean(row)}
                            onChange={(event) => setAllocation(invoice.id, event.target.checked ? Math.min(invoice.balance, Math.max(0, rest)) || invoice.balance : null)}
                          />
                        </label>
                      </td>
                      <td>
                        <span className="ref">{invoice.number}</span>
                      </td>
                      <td className="muted">{lateWords(invoice)}</td>
                      <td className="num">{money(invoice.balance, invoice.currency)}</td>
                      <td className="num" style={{ width: 150 }}>
                        <Input
                          className="num"
                          aria-label={`Amount for ${invoice.number}`}
                          inputMode="decimal"
                          value={row ? row.amount.toFixed(2) : ""}
                          aria-invalid={Boolean(errors[`allocation.${invoice.id}`]) || undefined}
                          onChange={(event) => {
                            const value = readAmount(event.target.value);
                            setAllocation(invoice.id, Number.isFinite(value) && value > 0 ? value : null);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="tot">
                  <td />
                  <td>On their account</td>
                  <td />
                  <td />
                  <td className="num">{money(Math.max(0, rest), form.currency)}</td>
                </tr>
              </tfoot>
            </table>
          )}
          {errors.allocations ? (
            <p className="error" role="alert">
              <Icon name="warn" />
              {errors.allocations}
            </p>
          ) : null}
        </WideSec>
      </BkFormPage>
    </>
  );
}

function RecordPayment() {
  const params = useSearchParams();
  const options = useQuery({ queryKey: ["books", "forms", "payment"], queryFn: () => fetchJson<BooksFormOptions>("/api/books/forms?for=payment") });
  if (options.data) return <PaymentFormPage options={options.data} initialCustomer={params.get("customer") ?? ""} initialInvoice={params.get("invoice")} />;
  return (
    <>
      <PageChrome title="Record a payment" backHref="/books/payments" backLabel="Payments received" />
      {options.isError ? <BooksError what="The payment form" onRetry={() => options.refetch()} /> : <BooksLoading />}
    </>
  );
}

/** Books → Sales → Record a payment (design/core-modules/boards/view/BkPaymentNew.html). */
export default function RecordPaymentPage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <RecordPayment />
      </React.Suspense>
    </BooksPage>
  );
}
