"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { BkBox, BkField, BkFormPage, BkSeg, FormSec, RailFigure, todayHarare, WideSec } from "@/components/books/bk-form";
import { PartyDrawer } from "@/components/books/bk-party-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Icon, Input, Kit, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { billFormErrors, billPayload, type BillForm } from "@/lib/books/bill-form";
import { money, shortDay } from "@/lib/books/format";
import { currencyWord, type BooksFormOptions } from "@/lib/books/form-options-view";
import { dueDate, formTotals, lineNet, type InvoiceFormLine } from "@/lib/books/invoice-form";

type Saved = { id: string; number: string | null; status: string; supplier: string };

const DUE = [
  { days: "30", label: "In 30 days" },
  { days: "7", label: "In 7 days" },
  { days: "14", label: "In 14 days" },
  { days: "0", label: "On receipt" },
  { days: "", label: "No due date" },
];

const blank = (taxCodeId: string): InvoiceFormLine => ({ description: "", quantity: "1", unitPrice: "", taxCodeId });
const plain = (n: number) => new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

function BillFormPage({ options }: { options: BooksFormOptions }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const vat = options.taxCodes[0]?.id ?? "";
  const [parties, setParties] = React.useState(options.parties);
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState<BillForm>(() => ({
    vendorId: "",
    theirNumber: "",
    billDate: todayHarare(),
    fdmsCode: "",
    currency: options.base,
    dueInDays: "30",
    costCenterId: "",
    lines: [blank(vat), blank(vat)],
  }));
  const [shown, setShown] = React.useState(false);
  const set = <K extends keyof BillForm>(key: K, value: BillForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<InvoiceFormLine>) => setForm((current) => ({ ...current, lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) }));
  const totals = formTotals(form.lines, options.taxCodes);
  const due = dueDate(form.billDate, form.dueInDays);
  const errors = shown ? billFormErrors(form) : {};
  const supplier = parties.find((party) => party.id === form.vendorId);

  const save = useMutation({
    mutationFn: (receive: boolean) => fetchJson<Saved>("/api/books/bills", { method: "POST", body: JSON.stringify(billPayload(form, receive)) }),
    onSuccess: async (saved) => {
      toast({
        title: saved.status === "DRAFT" ? `The draft bill from ${saved.supplier} is saved` : `${saved.number} from ${saved.supplier} is recorded`,
        description: saved.status === "DRAFT" ? "It takes its number when you record it." : "It is posted to the books.",
        variant: "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push("/books/expenses");
    },
    onError: (error) => toast({ title: "The bill was not saved", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const submit = (receive: boolean) => {
    setShown(true);
    if (Object.keys(billFormErrors(form)).length > 0) return;
    save.mutate(receive);
  };

  return (
    <>
      <PageChrome
        title="Record a bill"
        backHref="/books/expenses"
        backLabel="All spending"
        primary={{ label: "Record the bill", icon: "check", shortcut: "Ctrl ↵", onClick: () => submit(true), disabled: save.isPending ? "Saving" : undefined }}
      >
        <Kit contents>
          <Button icon="docs" onClick={() => submit(false)} disabled={save.isPending}>
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
                ["Due", due ? shortDay(due) : "No date"],
                ["Number", options.nextNumber],
              ]}
            />
            <section>
              <div className="sec-title">Checks</div>
              <dl className="attrs">
                <dt>ITF263</dt>
                <dd>Not recorded yet</dd>
                <dt>FDMS</dt>
                <dd>{form.fdmsCode.trim() ? "Code kept, not checked" : "Not checked"}</dd>
                <dt>Approval</dt>
                <dd>Not needed yet</dd>
              </dl>
            </section>
          </>
        }
      >
        <FormSec title="Supplier" text="Who sent it, and their fiscal invoice.">
          <BkField label="Supplier" htmlFor="bill-supplier" error={errors.vendorId}>
            <div style={{ display: "flex", gap: 8 }}>
              <Select id="bill-supplier" value={form.vendorId} onChange={(event) => set("vendorId", event.target.value)} style={{ flex: 1, minWidth: 0 }}>
                <option value="">Choose a supplier</option>
                {parties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </Select>
              <Button icon="plus" onClick={() => setAdding(true)}>
                New supplier
              </Button>
            </div>
          </BkField>
          <div className="field-row">
            <BkField label="Their invoice number" htmlFor="bill-theirs">
              <Input id="bill-theirs" aria-label="Their invoice number" value={form.theirNumber} onChange={(event) => set("theirNumber", event.target.value)} />
            </BkField>
            <BkField label="Their invoice date" htmlFor="bill-date" error={errors.billDate}>
              <Input id="bill-date" type="date" aria-label="Their invoice date" value={form.billDate} onChange={(event) => set("billDate", event.target.value)} />
            </BkField>
          </div>
          <BkField label="FDMS check" htmlFor="bill-fdms" hint="The code is kept with the bill. Checking it with FDMS comes with the bill's fiscal fields.">
            <div style={{ display: "flex", gap: 8 }}>
              <label className="input-wrap" style={{ flex: 1 }}>
                <input id="bill-fdms" aria-label="Verification code" placeholder="Verification code" value={form.fdmsCode} onChange={(event) => set("fdmsCode", event.target.value)} />
              </label>
              <Button disabled title="Checking with FDMS comes later">
                Check
              </Button>
            </div>
          </BkField>
          {supplier && !supplier.vatNumber ? (
            <BkBox tone="warn" icon="warn">
              <b>No VAT number on file for {supplier.name}.</b> Their VAT counts only on a valid fiscal invoice.
            </BkBox>
          ) : null}
        </FormSec>

        <WideSec title="Lines" text="What it was for.">
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
                    <Input aria-label="Item" value={line.description} placeholder="What it was for" aria-invalid={Boolean(errors[`lines.${index}.description`]) || undefined} onChange={(event) => setLine(index, { description: event.target.value })} />
                  </td>
                  <td>
                    <Input className="num" aria-label="Quantity" inputMode="decimal" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} />
                  </td>
                  <td>
                    <Input className="num" aria-label="Price" inputMode="decimal" placeholder="0.00" value={line.unitPrice} onChange={(event) => setLine(index, { unitPrice: event.target.value })} />
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
                    <Button variant="quiet" iconOnly icon="x" label="Remove the line" disabled={form.lines.length === 1} onClick={() => setForm((current) => ({ ...current, lines: current.lines.filter((_, at) => at !== index) }))} />
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

        <FormSec title="Terms" text="When you have to pay.">
          <div className="field-row">
            <BkField label="Currency">
              <BkSeg label="Currency" value={form.currency} onChange={(code) => set("currency", code)} options={options.currencies.map((code) => ({ value: code, label: code === "ZWG" ? "ZiG" : code }))} />
            </BkField>
            <BkField label="Due" htmlFor="bill-due">
              <Select id="bill-due" value={form.dueInDays} onChange={(event) => set("dueInDays", event.target.value)}>
                {DUE.map((option) => {
                  const day = dueDate(form.billDate, option.days);
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
            <BkField label="Cost centre" htmlFor="bill-centre">
              <Select id="bill-centre" value={form.costCenterId} onChange={(event) => set("costCenterId", event.target.value)}>
                <option value="">None</option>
                {options.costCentres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.label}
                  </option>
                ))}
              </Select>
            </BkField>
          </div>
        </FormSec>
      </BkFormPage>
      <PartyDrawer
        kind="supplier"
        open={adding}
        onOpenChange={setAdding}
        onCreated={(party) => {
          setParties((current) => [...current, { id: party.id, name: party.name, vatNumber: null, tin: null }].sort((a, b) => a.name.localeCompare(b.name)));
          set("vendorId", party.id);
          toast({ title: `${party.name} is added`, variant: "success" });
        }}
      />
    </>
  );
}

function RecordBill() {
  const options = useQuery({ queryKey: ["books", "forms", "bill"], queryFn: () => fetchJson<BooksFormOptions>("/api/books/forms?for=bill") });
  if (options.data) return <BillFormPage options={options.data} />;
  return (
    <>
      <PageChrome title="Record a bill" backHref="/books/expenses" backLabel="All spending" />
      {options.isError ? <BooksError what="The bill form" onRetry={() => options.refetch()} /> : <BooksLoading />}
    </>
  );
}

/** Books → Bills & spending → Record a bill (design/core-modules/boards/view/BkBillNew.html), over today's logic; approval comes with P2. */
export default function RecordBillPage() {
  return (
    <BooksPage screen="bk-a">
      <RecordBill />
    </BooksPage>
  );
}
