"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { BkBox, BkField, BkFormPage, FormSec, RailFigure, todayHarare, WideSec } from "@/components/books/bk-form";
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

type OpenBill = OpenInvoice & { note: string | null; fti: string | null };
type Approval = { limit: number; owner: string | null; youPay: boolean } | null;
type Options = BooksFormOptions & { openBills: OpenBill[]; approval: Approval; payFrom: string | null };
type Drafted = { supplier: string; payments: Array<{ id: string; status: string }>; total: number; waiting: boolean };

/** Their fiscal invoice number (D16); a bill from before it kept it in its note. */
const theirInvoice = (bill: OpenBill) => bill.fti ?? bill.note?.match(/Their invoice ([^.]+)/)?.[1] ?? "—";
const lateWords = (bill: OpenInvoice) => (bill.daysLate > 0 ? `${bill.daysLate} ${bill.daysLate === 1 ? "day" : "days"} overdue` : bill.due ? `Due ${shortDay(bill.due)}` : "No due date");

function PayForm({ options, initialSupplier, initialBills }: { options: Options; initialSupplier: string; initialBills: string[] }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const [parties, setParties] = React.useState(options.parties);
  const [adding, setAdding] = React.useState(false);
  const [vendorId, setVendorId] = React.useState(initialSupplier);
  // The account the last supplier payment left from, chosen to start with.
  const [bankAccountId, setBankAccountId] = React.useState(() => (options.payFrom && options.accounts.some((candidate) => candidate.id === options.payFrom) ? options.payFrom : ""));
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
  const over = options.approval ? total > options.approval.limit + 0.004 : false;
  const asked = React.useRef(initialBills);

  // D17 and §5.8.3: what this payment withholds, and the IMTT the bank takes on it, from the core.
  const billKey = picked.map((row) => row.invoiceId).join(",");
  const quote = useQuery({
    queryKey: ["books", "withholding-quote", vendorId, total, currency, billKey],
    queryFn: () =>
      fetchJson<{ itf263: { state: "Valid" | "Expired" | "None"; label: string; expires: string | null }; phone: string | null; withheld: number; net: number; rate: number; imtt: number; imttRate: number; dueBy: string }>(
        `/api/books/withholding/quote?${new URLSearchParams({ supplier: vendorId, amount: String(total), currency, bills: billKey }).toString()}`,
      ),
    enabled: Boolean(vendorId),
    placeholderData: (previous) => previous,
  });
  const q = quote.data;
  const withheld = q && total > 0 ? q.withheld : 0;
  const net = total - withheld;
  const imtt = q && total > 0 ? q.imtt : 0;

  React.useEffect(() => setPicked([]), [vendorId]);
  // Pay from Bills: the bills ticked there are ticked here, once they load.
  React.useEffect(() => {
    if (!asked.current.length || !bills.length) return;
    setPicked(bills.filter((bill) => asked.current.includes(bill.id)).map((bill) => ({ invoiceId: bill.id, amount: bill.balance })));
    asked.current = [];
  }, [bills]);
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

  // Save draft, or Send for approval (D5): a draft per bill; nothing moves until it is approved and paid.
  const pay = useMutation({
    mutationFn: (send: boolean) =>
      fetchJson<Drafted>("/api/books/payments-made/drafts", {
        method: "POST",
        body: JSON.stringify({ vendorId, bankAccountId, paidAt, send, ...(reference.trim() ? { reference: reference.trim() } : {}), bills: picked.map((row) => ({ billId: row.invoiceId, amount: row.amount })) }),
      }),
    onSuccess: async (done, send) => {
      toast({
        title: send ? `${money(done.total, currency)} to ${done.supplier} is sent for approval` : `The draft to ${done.supplier} is saved`,
        description: send ? (done.waiting ? `It waits for ${options.approval?.owner ?? "the owner"}, then it is paid from Payments made.` : "It is under the limit, so it is approved: pay it from Payments made.") : "Send it for approval from Payments made.",
        variant: "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push(send ? "/books/payments-made?view=to-approve" : "/books/payments-made");
    },
    onError: (error) => toast({ title: "The payment was not saved", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });

  const submit = (send: boolean) => {
    setShown(true);
    const problems = !vendorId || !picked.length || !bankAccountId || picked.some((row) => {
      const bill = bills.find((candidate) => candidate.id === row.invoiceId);
      return !bill || row.amount > bill.balance + 0.005 || (account && bill.currency !== account.currency);
    });
    if (!problems) pay.mutate(send);
  };
  const toggle = (bill: OpenBill, on: boolean) => setPicked((current) => (on ? [...current.filter((row) => row.invoiceId !== bill.id), { invoiceId: bill.id, amount: bill.balance }] : current.filter((row) => row.invoiceId !== bill.id)));

  const ratePct = q ? Math.round(q.rate * 100) : 30;
  const unclear = Boolean(vendorId && q && q.itf263.state !== "Valid" && withheld > 0);

  return (
    <>
      <PageChrome
        title={supplier ? `Pay ${supplier.name}` : "Pay bills"}
        backHref="/books/payments-made"
        backLabel="Payments made"
        primary={{ label: "Send for approval", icon: "send", shortcut: "Ctrl ↵", onClick: () => submit(true), disabled: pay.isPending ? "Saving it" : undefined }}
      >
        <Kit contents>
          <Button icon="docs" disabled={pay.isPending} onClick={() => submit(false)}>
            Save draft
          </Button>
        </Kit>
      </PageChrome>
      <BkFormPage
        rail={
          <RailFigure
            title="Approval"
            rows={[
              ["Approves", over ? (options.approval?.owner ?? "The owner") : options.approval ? `Not needed, within ${money(options.approval.limit, currency)}` : "Not needed"],
              ["Pays", options.approval?.youPay ? "You, not the approver" : "Whoever pays, not the approver"],
            ]}
          />
        }
      >
        {unclear && q ? (
          <BkBox
            tone="warn"
            icon="warn"
            action={
              <Link className="btn btn-sm" href={`/books/suppliers/${vendorId}`}>
                Add their ITF263
              </Link>
            }
          >
            <b>{supplier?.name ?? "The supplier"} has {q.itf263.state === "Expired" ? "no valid" : "no"} ITF263 on file.</b> {ratePct}% is withheld and paid to ZIMRA by {shortDay(q.dueBy)}.
          </BkBox>
        ) : null}

        <FormSec title="Pay">
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
          <div className="field-row">
            <BkField label="From" htmlFor="pay-from" error={errors.bankAccountId}>
              <Select id="pay-from" aria-label="From" value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)}>
                {bankAccountId ? null : <option value="">Choose an account</option>}
                {options.accounts.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.label}
                  </option>
                ))}
              </Select>
            </BkField>
            <BkField label="Pay on" htmlFor="pay-date">
              <Input id="pay-date" type="date" aria-label="Pay on" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
            </BkField>
          </div>
          <BkField label="Reference on their statement" htmlFor="pay-ref">
            <Input id="pay-ref" aria-label="Reference" value={reference} onChange={(event) => setReference(event.target.value)} />
          </BkField>
        </FormSec>

        <WideSec title="Bills" className={vendorId && bills.length && !errors.bills ? "bk-wt" : undefined}>
          {vendorId && bills.length ? (
            <table className="table bk-le">
              <thead>
                <tr>
                  <th className="sel" style={{ width: 60 }} />
                  <th>Bill</th>
                  <th>Their FTI</th>
                  <th>Due</th>
                  <th className="num">Owing</th>
                  <th className="num">Paying</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const row = picked.find((candidate) => candidate.invoiceId === bill.id);
                  return (
                    <tr key={bill.id} aria-selected={row ? true : undefined}>
                      <td className="sel">
                        <label className="check">
                          <input type="checkbox" aria-label={`Pay ${bill.number}`} checked={Boolean(row)} onChange={(event) => toggle(bill, event.target.checked)} />
                        </label>
                      </td>
                      <td>
                        <span className="ref">{bill.number}</span>
                      </td>
                      <td className="mono">{theirInvoice(bill)}</td>
                      <td className={bill.daysLate > 0 ? undefined : "muted"}>
                        {bill.daysLate > 0 ? (
                          <span className="status status-warning" style={{ color: "var(--color-ink)", fontWeight: 500 }}>
                            {lateWords(bill)}
                          </span>
                        ) : (
                          lateWords(bill)
                        )}
                      </td>
                      <td className="num">{money(bill.balance, bill.currency)}</td>
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
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : vendorId && !open.isLoading ? (
            <p className="bk-hint bk-pad">Nothing is owed to {supplier?.name ?? "them"}.</p>
          ) : null}
          {errors.bills ? (
            <p className="error bk-pad" role="alert">
              <Icon name="warn" />
              {errors.bills}
            </p>
          ) : null}
        </WideSec>

        <WideSec title="What leaves the bank">
          <div className="bk-bleed">
            <table className="table" aria-label="What leaves the bank">
              <colgroup>
                <col />
                <col style={{ width: 160 }} />
              </colgroup>
              <tbody>
                <tr>
                  <td>Bills paid</td>
                  <td className="num">{money(total, currency)}</td>
                </tr>
                {withheld > 0 ? (
                  <tr>
                    <td>
                      Withholding, {ratePct}% <span className="muted">to ZIMRA by {q ? shortDay(q.dueBy) : "the 10th"}</span>
                    </td>
                    <td className="num">−{money(withheld, currency)}</td>
                  </tr>
                ) : null}
                <tr className="tot">
                  <td>Paid to {supplier?.name ?? "the supplier"}</td>
                  <td className="num">{money(net, currency)}</td>
                </tr>
                <tr>
                  <td>IMTT, {Math.round((q?.imttRate ?? 0.02) * 1000) / 10}% on the transfer</td>
                  <td className="num">{money(imtt, currency)}</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="tot">
                  <td>Leaves {account ? account.label : "the account"}</td>
                  <td className="num">{money(net + imtt, currency)}</td>
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
  const options = useQuery({ queryKey: ["books", "forms", "payment-out"], queryFn: () => fetchJson<Options>("/api/books/forms?for=payment-out") });
  if (options.data) return <PayForm options={options.data} initialSupplier={params.get("supplier") ?? ""} initialBills={(params.get("bills") ?? "").split(",").filter(Boolean)} />;
  return (
    <>
      <PageChrome title="Pay bills" backHref="/books/payments-made" backLabel="Payments made" />
      {options.isError ? <BooksError what="The payment form" onRetry={() => options.refetch()} /> : <BooksLoading />}
    </>
  );
}

/** Books → Bills & spending → Pay a supplier (design/core-modules/boards/view/BkPaymentOutNew.html): drafts sent for approval (D5). */
export default function PaySupplierPage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <PaySupplier />
      </React.Suspense>
    </BooksPage>
  );
}
