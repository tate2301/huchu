"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";

import { BkBox, BkField, BkFormPage, BkSeg, FormSec, RailFigure, todayHarare, WideSec } from "@/components/books/bk-form";
import { BkState } from "@/components/books/bk-list";
import { PartyDrawer } from "@/components/books/bk-party-drawer";
import { BooksError, BooksLoading } from "@/components/books/books-state";
import { BooksPage } from "@/components/books/figures";
import { Button, Icon, Input, Kit, Select } from "@/components/core";
import { MenuButton } from "@/components/core/menu";
import { PageChrome } from "@/components/layout/page-chrome";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { billFormErrors, billPayload, fdmsSentence, type BillForm, type BillSpendingKind, type FdmsResult } from "@/lib/books/bill-form";
import type { BillRecordPage } from "@/lib/books/bill-record";
import { money, monthName, shortDay } from "@/lib/books/format";
import { currencyWord, type BooksFormOptions } from "@/lib/books/form-options-view";
import { dueDate, formTotals, lineNet, type InvoiceFormLine } from "@/lib/books/invoice-form";
import {
  nextRenewalDate,
  SPENDING_CATEGORY_GROUPS,
  SUBSCRIPTION_CYCLE_LABEL,
  SUBSCRIPTION_CYCLES,
  type SubscriptionCycle,
} from "@/lib/books/spending-categories";
import { uploadBooksFile } from "@/lib/books/upload-client";

type Options = BooksFormOptions & { approval: { limit: number; owner: string | null } | null };
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
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
const FDMS_WORD: Record<FdmsResult, string> = { NOT_CHECKED: "Not checked", VALID: "Valid", NOT_VALID: "Not valid" };

/** The FDMS check: the code from their invoice, and what FDMS said when the person looked it up (D16; no lookup API yet). */
function FdmsCheck({ code, status, onCode, onStatus }: { code: string; status: FdmsResult; onCode: (code: string) => void; onStatus: (status: FdmsResult) => void }) {
  return (
    <BkField label="FDMS check" htmlFor="bill-fdms" hint={status === "NOT_CHECKED" ? "Look the code up on FDMS, then say what it shows." : undefined}>
      <div style={{ display: "flex", gap: 8 }}>
        <label className="input-wrap" style={{ flex: 1 }}>
          <Icon name="fiscal" />
          <input id="bill-fdms" aria-label="Verification code" placeholder="Verification code" value={code} onChange={(event) => onCode(event.target.value)} />
        </label>
        <MenuButton
          iconEnd={undefined}
          align="end"
          label="What FDMS shows"
          items={[
            { key: "valid", icon: "check", label: "Valid on FDMS", checked: status === "VALID", onSelect: () => onStatus("VALID") },
            { key: "not-valid", icon: "warn", label: "Not valid on FDMS", checked: status === "NOT_VALID", onSelect: () => onStatus("NOT_VALID") },
            { key: "not-checked", icon: "clock", label: "Not checked yet", checked: status === "NOT_CHECKED", onSelect: () => onStatus("NOT_CHECKED") },
          ]}
        >
          Check
        </MenuButton>
      </div>
    </BkField>
  );
}

/** Their invoice as a photo: a picture or the PDF they emailed, kept with the bill once it is saved. */
function PhotoField({ file, kept, onFile }: { file: File | null; kept: string | null; onFile: (file: File | null) => void }) {
  const input = React.useRef<HTMLInputElement>(null);
  return (
    <BkField label="Their invoice, a photo" htmlFor="bill-photo">
      <Button icon="photo" style={{ justifyContent: "flex-start" }} onClick={() => input.current?.click()}>
        <span className="truncate">{file?.name ?? kept ?? "Add a photo"}</span>
      </Button>
      <input
        ref={input}
        id="bill-photo"
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        hidden
        onChange={(event) => {
          onFile(event.target.files?.[0] ?? null);
          event.target.value = "";
        }}
      />
    </BkField>
  );
}

function BillFormPage({ options, draft, initialKind }: { options: Options; draft: BillRecordPage | null; initialKind: BillSpendingKind }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const vat = options.taxCodes[0]?.id ?? "";
  const [parties, setParties] = React.useState(options.parties);
  const [adding, setAdding] = React.useState(false);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const defaultAccountFor = (code: string) => options.accounts.find((account) => account.currency === code)?.id ?? "";
  const [form, setForm] = React.useState<BillForm>(() => ({
    vendorId: draft?.supplier.id ?? "",
    theirNumber: draft?.fti.number ?? "",
    billDate: draft?.fti.dated ?? todayHarare(),
    fdmsCode: "",
    fdmsStatus: draft?.fti.fdms ?? "NOT_CHECKED",
    currency: draft?.currency ?? options.base,
    dueInDays: initialKind === "bill" ? "30" : "0",
    costCenterId: "",
    spendingKind: initialKind,
    category: initialKind === "subscription" ? "software-saas" : initialKind === "expense" ? "general-expense" : "stock-for-resale",
    subscriptionCycle: "monthly",
    paidNow: initialKind !== "bill" && !draft,
    paidFrom: defaultAccountFor(draft?.currency ?? options.base),
    paymentReference: "",
    // A goods receipt's draft: its lines as counted, each with the tax code of its rate, to bring into line with their invoice.
    lines: draft
      ? draft.lines.map((line) => ({
          description: line.description,
          quantity: qty(line.quantity),
          unitPrice: line.unitPrice.toFixed(2),
          taxCodeId: line.taxCodeId ?? options.taxCodes.find((code) => code.rate === line.taxRate)?.id ?? "",
        }))
      : [blank(vat)],
  }));
  const [shown, setShown] = React.useState(false);
  const set = <K extends keyof BillForm>(key: K, value: BillForm[K]) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index: number, patch: Partial<InvoiceFormLine>) => setForm((current) => ({ ...current, lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) }));
  const fromReceipt = draft?.match?.receipt ?? null;
  const totals = formTotals(form.lines, options.taxCodes);
  const due = dueDate(form.billDate, form.dueInDays);
  const errors = shown ? billFormErrors(form) : {};
  const supplier = parties.find((party) => party.id === form.vendorId);
  const box = fdmsSentence(form.fdmsStatus, monthName(form.billDate));
  const over = options.approval && totals.total > options.approval.limit + 0.004 && !draft?.details.approvedBy;
  const vatRegistered = Boolean(draft ? draft.supplier.vatNumber : supplier?.vatNumber);
  const matchingAccounts = options.accounts.filter((account) => account.currency === form.currency);
  const renewalDay =
    form.spendingKind === "subscription" && form.subscriptionCycle && /^\d{4}-\d{2}-\d{2}$/.test(form.billDate)
      ? nextRenewalDate(form.billDate, form.subscriptionCycle)
      : null;

  const keepPhoto = async (billId: string) => {
    if (!photo) return null;
    try {
      const stored = await uploadBooksFile(photo);
      await fetchJson(`/api/books/bills/${billId}`, { method: "PATCH", body: JSON.stringify({ action: "photo", file: stored }) });
      return null;
    } catch (error) {
      return getApiErrorMessage(error, "Their invoice was not kept.");
    }
  };

  const save = useMutation({
    mutationFn: async (receive: boolean): Promise<Saved & { photo: string | null }> => {
      if (draft) {
        // A goods receipt's draft: its lines as their invoice has them, their FTI and what FDMS said, then recorded through the core (or kept as a draft).
        const body = billPayload(form, false);
        await fetchJson(`/api/books/bills/${draft.id}`, { method: "PATCH", body: JSON.stringify({ action: "lines", lines: body.lines.map((line) => ({ ...line, taxCodeId: line.taxCodeId ?? null })) }) });
        await fetchJson(`/api/books/bills/${draft.id}`, { method: "PATCH", body: JSON.stringify({ action: "check", status: form.fdmsStatus, supplierFtiNumber: form.theirNumber.trim() || null }) });
        const photoError = await keepPhoto(draft.id);
        if (!receive) return { id: draft.id, number: null, status: "DRAFT", supplier: draft.supplier.name, photo: photoError };
        const saved = await fetchJson<{ id: string; number: string | null; status: string }>(`/api/books/bills/${draft.id}`, {
          method: "PATCH",
          body: JSON.stringify({ action: "record", supplierFtiNumber: form.theirNumber.trim() || null, fdmsStatus: form.fdmsStatus, dueDate: due ?? null, costCenterId: form.costCenterId || null }),
        });
        return { ...saved, supplier: draft.supplier.name, photo: photoError };
      }
      const saved = await fetchJson<Saved>("/api/books/bills", { method: "POST", body: JSON.stringify(billPayload(form, receive)) });
      return { ...saved, photo: await keepPhoto(saved.id) };
    },
    onSuccess: async (saved) => {
      toast({
        title:
          saved.status === "DRAFT"
            ? `Draft from ${saved.supplier} saved`
            : form.paidNow
              ? `${saved.number} from ${saved.supplier} recorded and marked paid`
              : `${saved.number} from ${saved.supplier} is recorded`,
        description:
          saved.photo ??
          (saved.status === "DRAFT"
            ? "It takes its number when you record it."
            : form.paidNow
              ? "Both the spending and its payment are posted to the books."
              : "It is posted to the books."),
        variant: saved.photo ? "destructive" : "success",
      });
      await client.invalidateQueries({ queryKey: ["books"] });
      router.push(`/books/bills/${saved.id}`);
    },
    onError: (error) => toast({ title: "The bill was not saved", description: getApiErrorMessage(error, "Check the connection and try again."), variant: "destructive" }),
  });
  const submit = (receive: boolean) => {
    setShown(true);
    if (Object.keys(billFormErrors(form)).length > 0) return;
    save.mutate(receive);
  };

  const approvalWord = over ? `Over ${money(options.approval!.limit, form.currency)}, ${options.approval!.owner ?? "the owner"} approves` : draft?.details.approvedBy ? `Approved by ${draft.details.approvedBy}` : "Not needed";

  const pageTitle =
    form.spendingKind === "subscription"
      ? "Record subscription or recurring cost"
      : form.spendingKind === "expense"
        ? "Record business expense"
        : "Record supplier bill";
  const primaryLabel =
    form.paidNow && !draft
      ? form.spendingKind === "subscription"
        ? "Save & mark paid"
        : "Record & mark paid"
      : form.spendingKind === "subscription"
        ? "Save subscription"
        : form.spendingKind === "expense"
          ? "Record expense"
          : "Record the bill";

  return (
    <>
      <PageChrome
        title={pageTitle}
        backHref="/books/bills"
        backLabel="Bills & spending"
        primary={{ label: primaryLabel, icon: "check", shortcut: "Ctrl ↵", onClick: () => submit(true), disabled: save.isPending ? "Saving" : undefined }}
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
                ["Payment", form.paidNow ? "Paid immediately" : due ? `Due ${shortDay(due)}` : "No due date"],
                ...(renewalDay ? ([["Next renewal", shortDay(renewalDay)]] as Array<[string, string]>) : []),
                ["Number", options.nextNumber],
              ]}
            />
            <section>
              <div className="sec-title">Checks</div>
              <dl className="attrs">
                <dt>ITF263</dt>
                <dd>{supplier?.itf263 ? <BkState tone={supplier.itf263.state === "Valid" ? "success" : "warning"}>{supplier.itf263.label.replace(/ \d{4}$/, "")}</BkState> : "Choose the supplier"}</dd>
                <dt>FDMS</dt>
                <dd>{form.fdmsStatus === "NOT_CHECKED" ? "Not checked" : <BkState tone={form.fdmsStatus === "VALID" ? "success" : "danger"}>{FDMS_WORD[form.fdmsStatus]}</BkState>}</dd>
                <dt>Match</dt>
                <dd>
                  {fromReceipt ? (
                    draft!.match!.differs ? (
                      <BkState tone="warning">{`${draft!.match!.differs} ${draft!.match!.differs === 1 ? "line differs" : "lines differ"}`}</BkState>
                    ) : (
                      <BkState tone="success">{`${fromReceipt.number} matches`}</BkState>
                    )
                  ) : (
                    "No order"
                  )}
                </dd>
                <dt>Approval</dt>
                <dd>{approvalWord}</dd>
              </dl>
            </section>
          </>
        }
      >
        {!draft ? (
          <FormSec title="1. Type of spending" text="Choose what kind of business cost you are recording and its industry category.">
            <BkField label="What are you recording?">
              <BkSeg
                label="Type of spending"
                value={form.spendingKind ?? "bill"}
                onChange={(kind) => {
                  const nextKind = kind as BillSpendingKind;
                  setForm((current) => ({
                    ...current,
                    spendingKind: nextKind,
                    dueInDays: nextKind === "bill" ? "30" : "0",
                    paidNow: nextKind !== "bill",
                    category:
                      nextKind === "subscription"
                        ? "software-saas"
                        : nextKind === "expense" && current.category === "stock-for-resale"
                          ? "general-expense"
                          : current.category,
                  }));
                }}
                options={[
                  { value: "bill", label: "Supplier bill" },
                  { value: "expense", label: "Everyday expense" },
                  { value: "subscription", label: "Subscription / Recurring" },
                ]}
              />
            </BkField>
            <div className="field-row">
              <BkField label="Spending category" htmlFor="bill-category" hint="Helps organize your spending across your industry">
                <Select id="bill-category" value={form.category ?? ""} onChange={(event) => set("category", event.target.value)}>
                  <option value="">General spending</option>
                  {SPENDING_CATEGORY_GROUPS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.items.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label} — {item.hint}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              </BkField>
              {form.spendingKind === "subscription" ? (
                <BkField
                  label="How often does it renew?"
                  htmlFor="bill-sub-cycle"
                  hint={renewalDay ? `Next renewal: ${shortDay(renewalDay)}` : undefined}
                >
                  <Select
                    id="bill-sub-cycle"
                    value={form.subscriptionCycle ?? "monthly"}
                    onChange={(event) => set("subscriptionCycle", event.target.value as SubscriptionCycle)}
                  >
                    {SUBSCRIPTION_CYCLES.map((cycle) => (
                      <option key={cycle} value={cycle}>
                        {SUBSCRIPTION_CYCLE_LABEL[cycle]}
                      </option>
                    ))}
                  </Select>
                </BkField>
              ) : null}
            </div>
          </FormSec>
        ) : null}

        <FormSec
          title={draft ? "Supplier" : "2. Who you paid (or owe)"}
          text={
            form.spendingKind === "subscription"
              ? "The provider (e.g. Starlink, Microsoft, Liquid, insurer, landlord) and billing date."
              : "Who sent the invoice or receipt, and the date on it."
          }
        >
          <BkField label={form.spendingKind === "subscription" ? "Provider / Supplier" : "Supplier / Payee"} htmlFor="bill-supplier" error={errors.vendorId}>
            {draft ? (
              <Select id="bill-supplier" value={draft.supplier.id} disabled>
                <option value={draft.supplier.id}>{draft.supplier.name}</option>
              </Select>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <Select id="bill-supplier" value={form.vendorId} onChange={(event) => set("vendorId", event.target.value)} style={{ flex: 1, minWidth: 0 }}>
                  <option value="">Choose a supplier or provider…</option>
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
            )}
          </BkField>
          <div className="field-row">
            <BkField label="Invoice or receipt number (optional)" htmlFor="bill-theirs" hint={vatRegistered ? "Required if claiming VAT from this supplier." : "Leave blank if there is no number"}>
              <Input id="bill-theirs" aria-label="Their invoice number" placeholder="E.g. INV-1042" value={form.theirNumber} onChange={(event) => set("theirNumber", event.target.value)} />
            </BkField>
            <BkField label="Date" htmlFor="bill-date" error={errors.billDate}>
              <Input id="bill-date" type="date" aria-label="Their invoice date" value={form.billDate} disabled={Boolean(draft)} onChange={(event) => set("billDate", event.target.value)} />
            </BkField>
          </div>
          {vatRegistered || totals.tax > 0.005 || form.fdmsCode || form.fdmsStatus !== "NOT_CHECKED" ? (
            <>
              <FdmsCheck code={form.fdmsCode} status={form.fdmsStatus} onCode={(code) => set("fdmsCode", code)} onStatus={(status) => set("fdmsStatus", status)} />
              {box ? (
                <BkBox tone={box.tone} icon={box.tone === "ok" ? "check" : "warn"}>
                  <b>{box.lead}</b>
                  {box.rest}
                </BkBox>
              ) : null}
            </>
          ) : null}
        </FormSec>

        {fromReceipt ? (
          <FormSec title="From" text="Made from the goods receipt.">
            <BkBox icon="list">
              <b>{fromReceipt.number}</b>
              {fromReceipt.counted ? `, counted in on ${fromReceipt.counted}` : ""}
              {fromReceipt.by ? ` by ${fromReceipt.by}` : ""}.
            </BkBox>
          </FormSec>
        ) : null}

        <WideSec title={draft ? "Lines" : "3. What it was for & how much"} text={fromReceipt ? `From ${fromReceipt.number}.` : "Add each item or service on the bill or receipt."}>
            <>
              <table className="table bk-le" aria-label="Lines">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th className="num" style={{ width: 84 }}>
                      Qty
                    </th>
                    <th className="num" style={{ width: 110 }}>
                      Price, {currencyWord(form.currency)}
                    </th>
                    {fromReceipt ? <th style={{ width: 136 }}>Account</th> : null}
                    <th style={{ width: 118 }}>VAT</th>
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
                        <Input
                          aria-label="Item"
                          value={line.description}
                          placeholder={
                            form.spendingKind === "subscription"
                              ? "E.g. Starlink Business monthly plan"
                              : form.spendingKind === "expense"
                                ? "E.g. Diesel for delivery van"
                                : "What you bought or were billed for"
                          }
                          aria-invalid={Boolean(errors[`lines.${index}.description`]) || undefined}
                          onChange={(event) => setLine(index, { description: event.target.value })}
                        />
                      </td>
                      <td>
                        <Input className="num" aria-label="Quantity" inputMode="decimal" value={line.quantity} onChange={(event) => setLine(index, { quantity: event.target.value })} />
                      </td>
                      <td>
                        <Input className="num" aria-label="Price" inputMode="decimal" placeholder="0.00" value={line.unitPrice} onChange={(event) => setLine(index, { unitPrice: event.target.value })} />
                      </td>
                      {fromReceipt ? (
                        <td>
                          {/* Where the goods receipt put them: the bill clears what it credited, so the account is the receipt's. */}
                          <Select aria-label="Account" value="receipt" disabled>
                            <option value="receipt">{fromReceipt.account ?? "Goods received"}</option>
                          </Select>
                        </td>
                      ) : null}
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
                  Add another line
                </Button>
              </div>
            </>
        </WideSec>

        <FormSec title={draft ? "Terms" : "4. Payment & receipt photo"} text="Say whether this is already paid or due later, and attach a photo of the invoice or receipt if you have one.">
          <div className="field-row">
            <BkField label="Currency">
              {draft ? (
                // A goods receipt's bill is in the currency it was counted in.
                <BkSeg label="Currency" value={draft.currency} onChange={() => undefined} options={options.currencies.map((code) => ({ value: code, label: code, disabled: code !== draft.currency }))} />
              ) : (
                <BkSeg
                  label="Currency"
                  value={form.currency}
                  onChange={(code) =>
                    setForm((current) => ({
                      ...current,
                      currency: code,
                      paidFrom: options.accounts.find((a) => a.currency === code)?.id ?? "",
                    }))
                  }
                  options={options.currencies.map((code) => ({ value: code, label: code }))}
                />
              )}
            </BkField>
            {!draft ? (
              <BkField label="Payment status">
                <BkSeg
                  label="Payment status"
                  value={form.paidNow ? "paid" : "later"}
                  onChange={(mode) =>
                    setForm((current) => ({
                      ...current,
                      paidNow: mode === "paid",
                      paidFrom: current.paidFrom || defaultAccountFor(current.currency),
                    }))
                  }
                  options={[
                    { value: "later", label: "To pay later" },
                    { value: "paid", label: "Already paid" },
                  ]}
                />
              </BkField>
            ) : null}
          </div>

          {form.paidNow && !draft ? (
            <div className="field-row">
              <BkField label="Paid from (Bank, Mobile Money, or Cash)" htmlFor="bill-paid-from" error={errors.paidFrom}>
                <Select id="bill-paid-from" value={form.paidFrom ?? ""} onChange={(event) => set("paidFrom", event.target.value)}>
                  {matchingAccounts.length === 0 ? <option value="">No {form.currency} account found</option> : null}
                  {matchingAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label}
                    </option>
                  ))}
                </Select>
              </BkField>
              <BkField label="Payment reference (optional)" htmlFor="bill-pay-ref">
                <Input
                  id="bill-pay-ref"
                  value={form.paymentReference ?? ""}
                  placeholder="EcoCash ref, card, or transfer ref"
                  onChange={(event) => set("paymentReference", event.target.value)}
                />
              </BkField>
            </div>
          ) : (
            <BkField label="When is it due?" htmlFor="bill-due">
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
          )}

          <div className="field-row">
            <BkField label="Department / Cost centre (optional)" htmlFor="bill-centre">
              <Select id="bill-centre" value={form.costCenterId} onChange={(event) => set("costCenterId", event.target.value)}>
                <option value="">None</option>
                {options.costCentres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.label}
                  </option>
                ))}
              </Select>
            </BkField>
            <PhotoField file={photo} kept={draft?.photo?.name ?? null} onFile={setPhoto} />
          </div>
        </FormSec>
      </BkFormPage>
      {!draft ? (
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
      ) : null}
    </>
  );
}

function RecordBill() {
  const params = useSearchParams();
  const billId = params.get("bill");
  const rawKind = params.get("kind");
  const initialKind: BillSpendingKind = rawKind === "expense" || rawKind === "subscription" ? rawKind : "bill";
  const options = useQuery({ queryKey: ["books", "forms", "bill"], queryFn: () => fetchJson<Options>("/api/books/forms?for=bill") });
  const draft = useQuery({ queryKey: ["books", "bill", billId], queryFn: () => fetchJson<BillRecordPage>(`/api/books/bills/${billId}`), enabled: Boolean(billId) });
  if (options.data && (!billId || draft.data)) {
    if (draft.data && draft.data.status !== "DRAFT") {
      return (
        <>
          <PageChrome title="New bill" backHref="/books/bills" backLabel="Bills" />
          <BooksError what={`${draft.data.number} is recorded already, so this form`} onRetry={() => draft.refetch()} />
        </>
      );
    }
    return <BillFormPage options={options.data} draft={draft.data ?? null} initialKind={initialKind} />;
  }
  return (
    <>
      <PageChrome title="Record spending" backHref="/books/bills" backLabel="Bills & spending" />
      {options.isError || draft.isError ? <BooksError what="The bill form" onRetry={() => (options.isError ? options.refetch() : draft.refetch())} /> : <BooksLoading />}
    </>
  );
}

/** Books → Bills & spending → New bill (design/core-modules/boards/view/BkBillNew.html), by hand or finishing a goods receipt's draft (`?bill=`). */
export default function RecordBillPage() {
  return (
    <BooksPage screen="bk-a">
      <React.Suspense fallback={<BooksLoading />}>
        <RecordBill />
      </React.Suspense>
    </BooksPage>
  );
}
