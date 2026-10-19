"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { BkBox, BkField, BkFormPage, FormSec, RailFigure, RailSteps, todayHarare, WideSec } from "@/components/books/bk-form";
import { PartyDrawer } from "@/components/books/bk-party-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Icon, Input, Kit, Select } from "@/components/core";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { money, shortDay } from "@/lib/books/format";
import type { BooksFormOptions } from "@/lib/books/form-options-view";
import { readAmount, type Allocation, type OpenInvoice } from "@/lib/books/payment-form";

type OpenBill = OpenInvoice & { note: string | null };
type Options = BooksFormOptions & { openBills: OpenBill[] };
type Paid = { supplier: string; payments: Array<{ number: string }>; total: number };

const theirInvoice = (note: string | null) => note?.match(/Their invoice ([^.]+)/)?.[1] ?? "—";
const lateWords = (bill: OpenInvoice) => (bill.daysLate > 0 ? `${bill.daysLate} ${bill.daysLate === 1 ? "day" : "days"} overdue` : bill.due ? `Due ${shortDay(bill.due)}` : "No due date");

function PayForm({ options, initialSupplier }: { options: BooksFormOptions; initialSupplier: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const [parties, setParties] = React.useState(options.parties);
  const [adding, setAdding] = React.useState(false);
  const [vendorId, setVendorId] = React.useState(initialSupplier);
  const [bankAccountId, setBankAccountId] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(todayHarare());
  const [reference, setReference] = React.useState("");
  const [picked, setPicked] = React.useState<Allocation[]>([]);
  const [shown, setShown] = React.useState(false);

  const open = useQuery({
    queryKey: ["books", "forms", "payment-out", vendorId],
    queryFn: () => fetchJson<Options>(`/api/books/forms?for=payment-out&supplier=${vendorId}`),
    enabled: Boolean(vendorId),
  });
  const bills = React.useMemo(() => open.data?.openBills ?? [], [open.data]);
  const supplier = parties.find((party) => party.id === vendorId);
  const account = options.accounts.find((candidate) => candidate.id === bankAccountId);
  const currency = account?.currency ?? bills[0]?.currency ?? options.base;
  const total = picked.reduce((sum, row) => sum + row.amount, 0);

  React.useEffect(() => setPicked([]), [vendorId]);
  React.useEffect(() => {
    if (!reference && picked.length === 1) setReference(bills.find((bill) => bill.id === picked[0].invoiceId)?.number ?? "");
  }, [picked, bills, reference]);

  const errors: Record<string, string> = {};
  if (shown) {
    if (!vendorId) errors.vendorId = "Choose who is paid.";
    if (!picked.length) errors.bills = "Tick the bills this pays.";
    if (!bankAccountId) errors.bankAccountId = "Say which account it leaves.";
    for (const row of picked) {
      const bill = bills.find((candidate) => candidate.id === row.invoiceId);
      if (bill && row.amount > bill.balance + 0.005) errors.bills = `${bill.number} owes less than that.`;
      if (bill && account && bill.currency !== account.currency) errors.bills = `${bill.number} is in ${bill.currency}; that account holds ${account.currency}.`;
    }
  }

  const pay = useMutation({
    mutationFn: () =>
      fetchJson<Paid>("/api/books/payments-made", {
        method: "POST",
        body: JSON.stringify({ vendorId, bankAccountId, paidAt, ...(reference.trim() ? { reference: reference.trim() } : {}), bills: picked.map((row) => ({ billId: row.invoiceId, amount: row.amount })) }),
      }),
    onSuccess: async (done) => {
      toast({ title: `${money(done.total, currency)} to ${done.supplier} is recorded`, description: `${done.payments.map((payment) => payment.number).join(", ")}.`, variant: "success" });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push("/books/expenses");
    },
    onError: (error) => toast({ title: "The payment was not recorded", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const submit = () => {
    setShown(true);
    const problems = !vendorId || !picked.length || !bankAccountId || picked.some((row) => {
      const bill = bills.find((candidate) => candidate.id === row.invoiceId);
      return !bill || row.amount > bill.balance + 0.005 || (account && bill.currency !== account.currency);
    });
    if (!problems) pay.mutate();
  };
  const toggle = (bill: OpenBill, on: boolean) => setPicked((current) => (on ? [...current.filter((row) => row.invoiceId !== bill.id), { invoiceId: bill.id, amount: bill.balance }] : current.filter((row) => row.invoiceId !== bill.id)));

  return (
    <>
      <PageChrome
        title="Pay a supplier"
        backHref="/books/expenses"
        backLabel="All spending"
        primary={{ label: "Record the payment", icon: "check", shortcut: "Ctrl ↵", onClick: submit, disabled: pay.isPending ? "Recording it" : undefined }}
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
              figure={money(total, currency)}
              rows={[
                ["Bills", String(picked.length)],
                ["Withheld", "Not recorded yet"],
                ["Approval", "Not needed yet"],
              ]}
            />
            <RailSteps
              title="When it is paid"
              steps={[
                ["It gets a number", options.nextNumber],
                ["The money leaves", account ? `${account.label}, ${money(total, currency)}` : "the account you choose"],
                ["The bills", picked.length === 1 ? "show it as paid" : "each show their payment"],
              ]}
            />
          </>
        }
      >
        <FormSec title="Pay" text="One payment can clear several bills.">
          <BkField label="Supplier" htmlFor="pay-supplier" error={errors.vendorId}>
            <div style={{ display: "flex", gap: 8 }}>
              <Select id="pay-supplier" value={vendorId} onChange={(event) => setVendorId(event.target.value)} style={{ flex: 1, minWidth: 0 }}>
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
          {vendorId ? (
            bills.length ? (
              <table className="table bk-le">
                <thead>
                  <tr>
                    <th className="sel" style={{ width: 36 }} />
                    <th>Bill</th>
                    <th>Their invoice</th>
                    <th>Due</th>
                    <th className="num">Owing</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => {
                    const row = picked.find((candidate) => candidate.invoiceId === bill.id);
                    return (
                      <tr key={bill.id}>
                        <td className="sel">
                          <label className="check">
                            <input type="checkbox" aria-label={`Pay ${bill.number}`} checked={Boolean(row)} onChange={(event) => toggle(bill, event.target.checked)} />
                          </label>
                        </td>
                        <td>
                          <span className="ref">{bill.number}</span>
                        </td>
                        <td className="mono">{theirInvoice(bill.note)}</td>
                        <td className="muted">{lateWords(bill)}</td>
                        <td className="num">
                          {row ? (
                            <Input
                              className="num"
                              aria-label={`Amount for ${bill.number}`}
                              inputMode="decimal"
                              value={row.amount.toFixed(2)}
                              onChange={(event) => {
                                const value = readAmount(event.target.value);
                                setPicked((current) => current.map((entry) => (entry.invoiceId === bill.id ? { ...entry, amount: Number.isFinite(value) ? value : 0 } : entry)));
                              }}
                              style={{ width: 120, marginLeft: "auto" }}
                            />
                          ) : (
                            money(bill.balance, bill.currency)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : open.isLoading ? null : (
              <p className="bk-hint">Nothing is owed to {supplier?.name ?? "them"}: every bill of theirs is paid.</p>
            )
          ) : null}
          {errors.bills ? (
            <p className="error" role="alert">
              <Icon name="warn" />
              {errors.bills}
            </p>
          ) : null}
        </FormSec>

        <FormSec title="ITF263" text="Checked before every payment.">
          <BkBox tone="warn" icon="warn">
            <b>Not recorded yet.</b> Books keeps no ITF263 for {supplier?.name ?? "suppliers"} yet: check theirs by hand, and withhold 30% where it has run out.
          </BkBox>
        </FormSec>

        <FormSec title="From" text="The bank takes IMTT on top.">
          <div className="field-row">
            <BkField label="Pay from" htmlFor="pay-from" error={errors.bankAccountId}>
              <Select id="pay-from" aria-label="Pay from" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
                <option value="">Choose an account</option>
                {options.accounts.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </Select>
            </BkField>
            <BkField label="Date" htmlFor="pay-date">
              <Input id="pay-date" type="date" aria-label="Date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </BkField>
          </div>
          <BkField label="Reference on their statement" htmlFor="pay-ref">
            <Input id="pay-ref" aria-label="Reference" value={reference} onChange={(event) => setReference(event.target.value)} />
          </BkField>
        </FormSec>

        <WideSec title="What moves">
          <div className="bk-bleed bk-bleed-form">
            <table className="table" aria-label="What moves">
              <thead>
                <tr>
                  <th />
                  <th className="num">Amount</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {picked.map((row) => (
                  <tr key={row.invoiceId}>
                    <td>Bill {bills.find((bill) => bill.id === row.invoiceId)?.number}</td>
                    <td className="num">{money(row.amount, currency)}</td>
                    <td />
                  </tr>
                ))}
                <tr>
                  <td>Paid to {supplier?.name ?? "the supplier"}</td>
                  <td className="num">{money(total, currency)}</td>
                  <td className="muted">Withholding and IMTT are not worked out yet</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="tot">
                  <td>Leaves {account?.label ?? "the account"}</td>
                  <td className="num">{money(total, currency)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </WideSec>
      </BkFormPage>
      <PartyDrawer
        kind="supplier"
        open={adding}
        onOpenChange={setAdding}
        onCreated={(party) => {
          setParties((current) => [...current, { id: party.id, name: party.name, vatNumber: null, tin: null }].sort((a, b) => a.name.localeCompare(b.name)));
          setVendorId(party.id);
          toast({ title: `${party.name} is added`, variant: "success" });
        }}
      />
    </>
  );
}

function PaySupplier() {
  const params = useSearchParams();
  const options = useQuery({ queryKey: ["books", "forms", "payment-out"], queryFn: () => fetchJson<BooksFormOptions>("/api/books/forms?for=payment-out") });
  if (options.data) return <PayForm options={options.data} initialSupplier={params.get("supplier") ?? ""} />;
  return (
    <>
      <PageChrome title="Pay a supplier" backHref="/books/expenses" backLabel="All spending" />
      {options.isError ? <BooksError what="The payment form" onRetry={() => options.refetch()} /> : <BooksLoading />}
    </>
  );
}

/** Books → Bills & spending → Pay a supplier (design/core-modules/boards/view/BkPaymentOutNew.html), over today's logic. */
export default function PaySupplierPage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <PaySupplier />
      </React.Suspense>
    </BooksPage>
  );
}
