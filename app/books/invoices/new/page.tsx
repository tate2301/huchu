"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { BkBox, BkField, BkFormPage, BkSeg, FormSec, RailFigure, RailSteps, todayHarare, WideSec } from "@/components/books/bk-form";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Check, Icon, Input, Kit, Select, TextArea } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money, shortDay } from "@/lib/books/format";
import { currencyWord, type BooksFormOptions } from "@/lib/books/form-options-view";
import { dueDate, formTotals, invoiceFormErrors, invoicePayload, lineNet, type InvoiceForm, type InvoiceFormLine } from "@/lib/books/invoice-form";

type Options = BooksFormOptions & {
  quote: { id: string; quotationNumber: string; customerId: string; currency: string; notes: string | null; lines: Array<{ description: string; quantity: number; unitPrice: number; taxCodeId: string | null }> } | null;
};

type Created = { id: string; number: string | null; status: string; customer: string; receipt: { receiptNumber: string } | null };

const DUE = [
  { days: "14", label: "In 14 days" },
  { days: "7", label: "In 7 days" },
  { days: "30", label: "In 30 days" },
  { days: "0", label: "On receipt" },
  { days: "", label: "No due date" },
];

const blank = (taxCodeId: string): InvoiceFormLine => ({ description: "", quantity: "1", unitPrice: "", taxCodeId });
const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function NewInvoiceForm({ options }: { options: Options }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const params = useSearchParams();
  const vat = options.taxCodes[0]?.id ?? "";
  const quote = options.quote;
  const [form, setForm] = React.useState<InvoiceForm>(() => ({
    customerId: quote?.customerId ?? params.get("customer") ?? "",
    currency: quote?.currency ?? options.base,
    invoiceDate: todayHarare(),
    dueInDays: "14",
    costCenterId: "",
    notes: quote?.notes ?? "",
    lines: quote?.lines.length
      ? quote.lines.map((line) => ({ description: line.description, quantity: String(line.quantity), unitPrice: String(line.unitPrice), taxCodeId: line.taxCodeId ?? vat }))
      : [blank(vat), blank(vat)],
    paidNow: false,
    paidInto: "",
    quotationId: quote?.id ?? null,
  }));
  const [shown, setShown] = React.useState<"draft" | "issue" | null>(null);
  const set = <K extends keyof InvoiceForm>(key: K, value: InvoiceForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<InvoiceFormLine>) =>
    setForm((current) => ({ ...current, lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) }));

  const customer = options.parties.find((party) => party.id === form.customerId);
  const totals = formTotals(form.lines, options.taxCodes);
  const foreign = form.currency !== options.base;
  const rate = foreign ? options.rates[form.currency] : null;
  const due = dueDate(form.invoiceDate, form.dueInDays);
  const errors = shown ? invoiceFormErrors(form, shown) : {};
  const accounts = options.accounts.filter((account) => account.currency === form.currency);

  const save = useMutation({
    mutationFn: (intent: "draft" | "issue") => fetchJson<Created>("/api/books/invoices", { method: "POST", body: JSON.stringify(invoicePayload(form, intent)) }),
    onSuccess: async (created) => {
      toast({
        title: created.status === "DRAFT" ? `The draft for ${created.customer} is saved` : `${created.number} is issued to ${created.customer}`,
        description: created.receipt ? `${created.receipt.receiptNumber} records the payment.` : created.status === "DRAFT" ? "It takes its number when you issue it." : "It is posted to the books.",
        variant: "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push(`/books/invoices/${created.id}`);
    },
    onError: (error) => toast({ title: "The invoice was not saved", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const submit = (intent: "draft" | "issue") => {
    setShown(intent);
    if (Object.keys(invoiceFormErrors(form, intent)).length > 0) return;
    save.mutate(intent);
  };

  const steps: Array<[string, string]> = [
    ["It gets the next number", options.nextNumber],
    foreign
      ? rate
        ? ["The rate is fixed", `${rate.rate.toFixed(2)}, ${rate.source}`]
        : ["It needs a rate", `${currencyWord(form.currency)} to ${currencyWord(options.base)}1, in Rates`]
      : ["It is in", `${currencyWord(form.currency)}, the books' own currency`],
    ["FDMS signs it", `in ${form.currency}, where this workspace fiscalises`],
    ["It posts", customer ? `and ${customer.name} owes it` : "and the customer owes it"],
  ];

  return (
    <>
      <PageChrome
        title="New invoice"
        backHref="/books/invoices"
        backLabel="Invoices"
        primary={{ label: "Issue", icon: "send", shortcut: "I", onClick: () => submit("issue"), disabled: save.isPending ? "Saving" : undefined }}
      >
        <Kit contents>
          <Button icon="docs" onClick={() => submit("draft")} disabled={save.isPending}>
            Save draft
          </Button>
        </Kit>
      </PageChrome>
      <BkFormPage
        rail={
          <>
            <RailFigure
              title="Total"
              figure={money(totals.total, form.currency)}
              rows={[
                ["Before VAT", money(totals.net, form.currency)],
                [totals.rates.length === 1 ? `VAT at ${totals.rates[0]}%` : "VAT", money(totals.tax, form.currency)],
                ...(foreign && rate ? ([[`In ${currencyWord(options.base)}`, money(totals.total / rate.rate, options.base)]] as Array<[string, string]>) : []),
                ["Due", due ? shortDay(due) : "No date"],
              ]}
            />
            <RailSteps title="When you press Issue" steps={steps} />
          </>
        }
      >
        <FormSec title="Customer" text="Who the invoice is to.">
          <BkField label="Customer" htmlFor="inv-customer" error={errors.customerId}>
            <Select id="inv-customer" value={form.customerId} onChange={(event) => set("customerId", event.target.value)}>
              <option value="">Choose a customer</option>
              {options.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </BkField>
          {customer ? (
            customer.vatNumber && customer.tin ? (
              <BkBox tone="ok" icon="check">
                <b>VAT number and TIN on file.</b>
                {quote ? ` Made from ${quote.quotationNumber}.` : null}
              </BkBox>
            ) : (
              <BkBox tone="warn" icon="warn">
                <b>{customer.vatNumber ? "No TIN on file." : "No VAT number on file."}</b> FDMS needs both when the buyer is registered for VAT.
              </BkBox>
            )
          ) : null}
        </FormSec>

        <FormSec title="Currency" text={`Reports show it in ${currencyWord(options.base)}.`}>
          <BkField label="Currency">
            <BkSeg
              label="Currency"
              value={form.currency}
              onChange={(code) => setForm((current) => ({ ...current, currency: code, paidInto: "" }))}
              options={options.currencies.map((code) => ({ value: code, label: code }))}
            />
          </BkField>
          {foreign ? (
            <div className="field-row">
              <BkField label={`Rate, ${currencyWord(form.currency)} to ${currencyWord(options.base)}1`} hint={rate ? "Fixed when you press Issue" : "No rate for this currency yet: add today's in Rates"}>
                <label className="input-wrap">
                  <Icon name="lock" />
                  <input aria-label="Rate" value={rate ? rate.rate.toFixed(2) : "—"} readOnly />
                </label>
              </BkField>
              <BkField label="Rate from">
                <Input aria-label="Rate from" value={rate ? `${rate.source}, ${shortDay(rate.day)}` : "—"} readOnly />
              </BkField>
            </div>
          ) : null}
        </FormSec>

        <WideSec title="Lines">
          <table className="table bk-le" aria-label="Lines">
            <thead>
              <tr>
                <th>Item</th>
                <th className="num" style={{ width: 84 }}>
                  Quantity
                </th>
                <th className="num" style={{ width: 100 }}>
                  Price, {currencyWord(form.currency)}
                </th>
                <th style={{ width: 118 }}>Tax code</th>
                <th className="num" style={{ width: 104 }}>
                  Amount
                </th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {form.lines.map((line, index) => (
                <tr key={index}>
                  <td>
                    <Input aria-label="Item" value={line.description} placeholder="What it is for" aria-invalid={Boolean(errors[`lines.${index}.description`]) || undefined} onChange={(event) => setLine(index, { description: event.target.value })} />
                  </td>
                  <td>
                    <Input className="num" aria-label="Quantity" inputMode="decimal" value={line.quantity} aria-invalid={Boolean(errors[`lines.${index}.quantity`]) || undefined} onChange={(event) => setLine(index, { quantity: event.target.value })} />
                  </td>
                  <td>
                    <Input className="num" aria-label="Price" inputMode="decimal" value={line.unitPrice} placeholder="0.00" aria-invalid={Boolean(errors[`lines.${index}.unitPrice`]) || undefined} onChange={(event) => setLine(index, { unitPrice: event.target.value })} />
                  </td>
                  <td>
                    <Select aria-label="Tax code" value={line.taxCodeId} onChange={(event) => setLine(index, { taxCodeId: event.target.value })}>
                      {options.taxCodes.map((code) => (
                        <option key={code.id} value={code.id}>
                          {code.label}
                        </option>
                      ))}
                      <option value="">No VAT</option>
                    </Select>
                  </td>
                  <td className="num" style={{ color: "var(--color-ink)" }}>
                    {plain(lineNet(line))}
                  </td>
                  <td>
                    <Button
                      variant="quiet"
                      iconOnly
                      icon="x"
                      label="Remove the line"
                      disabled={form.lines.length === 1}
                      onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {errors.lines ? (
            <p className="error bk-add" role="alert">
              <Icon name="warn" />
              {errors.lines}
            </p>
          ) : null}
          <div className="bk-add">
            <Button variant="quiet" icon="plus" onClick={() => setForm((current) => ({ ...current, lines: [...current.lines, blank(vat)] }))}>
              Add a line
            </Button>
          </div>
        </WideSec>

        <FormSec title="Terms" text="When it is due.">
          <div className="field-row">
            <BkField label="Invoice date" htmlFor="inv-date" error={errors.invoiceDate}>
              <Input id="inv-date" type="date" value={form.invoiceDate} onChange={(event) => set("invoiceDate", event.target.value)} />
            </BkField>
            <BkField label="Due" htmlFor="inv-due">
              <Select id="inv-due" value={form.dueInDays} onChange={(event) => set("dueInDays", event.target.value)}>
                {DUE.map((option) => {
                  const day = dueDate(form.invoiceDate, option.days);
                  return (
                    <option key={option.label} value={option.days}>
                      {option.label}
                      {day && option.days !== "0" ? `, ${shortDay(day)}` : ""}
                    </option>
                  );
                })}
              </Select>
            </BkField>
          </div>
          <div className="field-row">
            <BkField label="Cost centre" htmlFor="inv-centre">
              <Select id="inv-centre" value={form.costCenterId} onChange={(event) => set("costCenterId", event.target.value)}>
                <option value="">None</option>
                {options.costCentres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.label}
                  </option>
                ))}
              </Select>
            </BkField>
            {form.paidNow ? (
              <BkField label="Paid into" htmlFor="inv-paid" error={errors.paidInto}>
                <Select id="inv-paid" value={form.paidInto} onChange={(event) => set("paidInto", event.target.value)}>
                  <option value="">Choose an account</option>
                  {accounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.label}
                    </option>
                  ))}
                </Select>
              </BkField>
            ) : null}
          </div>
          <Check checked={form.paidNow} onCheckedChange={(on) => set("paidNow", on)} label="Paid now" />
          <BkField label="Note to the customer" htmlFor="inv-note" optional>
            <TextArea id="inv-note" aria-label="Note to the customer" value={form.notes} onChange={(event) => set("notes", event.target.value)} />
          </BkField>
        </FormSec>
      </BkFormPage>
    </>
  );
}

function NewInvoice() {
  const params = useSearchParams();
  const quote = params.get("quote");
  const options = useQuery({
    queryKey: ["books", "forms", "invoice", quote],
    queryFn: () => fetchJson<Options>(`/api/books/forms?for=invoice${quote ? `&quote=${encodeURIComponent(quote)}` : ""}`),
  });
  if (options.data) return <NewInvoiceForm options={options.data} />;
  return (
    <>
      <PageChrome title="New invoice" backHref="/books/invoices" backLabel="Invoices" />
      {options.isError && !(options.error instanceof ApiError && options.error.status === 401) ? (
        <BooksError what="The invoice form" onRetry={() => options.refetch()} />
      ) : (
        <BooksLoading />
      )}
    </>
  );
}

/** Books → Sales → New invoice (design/core-modules/boards/view/BkInvoiceNew.html): issued through the core, or saved as a draft. */
export default function NewInvoicePage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <NewInvoice />
      </React.Suspense>
    </BooksPage>
  );
}
