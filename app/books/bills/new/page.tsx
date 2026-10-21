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
import { billFormErrors, billPayload, fdmsSentence, type BillForm, type FdmsResult } from "@/lib/books/bill-form";
import type { BillRecordPage } from "@/lib/books/bill-record";
import { money, monthName, shortDay } from "@/lib/books/format";
import { currencyWord, type BooksFormOptions } from "@/lib/books/form-options-view";
import { dueDate, formTotals, lineNet, type InvoiceFormLine } from "@/lib/books/invoice-form";
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
    <BkField label="FDMS check" htmlFor="bill-fdms">
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

function BillFormPage({ options, draft }: { options: Options; draft: BillRecordPage | null }) {
  const router = useRouter();
  const client = useQueryClient();
  const { toast } = useToast();
  const vat = options.taxCodes[0]?.id ?? "";
  const [parties, setParties] = React.useState(options.parties);
  const [adding, setAdding] = React.useState(false);
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [form, setForm] = React.useState<BillForm>(() => ({
    vendorId: draft?.supplier.id ?? "",
    theirNumber: draft?.fti.number ?? "",
    billDate: draft?.fti.dated ?? todayHarare(),
    fdmsCode: "",
    fdmsStatus: draft?.fti.fdms ?? "NOT_CHECKED",
    currency: draft?.currency ?? options.base,
    dueInDays: "30",
    costCenterId: "",
    // A goods receipt's draft: its lines as counted, each with the tax code of its rate, to bring into line with their invoice.
    lines: draft
      ? draft.lines.map((line) => ({
          description: line.description,
          quantity: qty(line.quantity),
          unitPrice: line.unitPrice.toFixed(2),
          taxCodeId: line.taxCodeId ?? options.taxCodes.find((code) => code.rate === line.taxRate)?.id ?? "",
        }))
      : [blank(vat), blank(vat)],
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
        title: saved.status === "DRAFT" ? `The draft bill from ${saved.supplier} is saved` : `${saved.number} from ${saved.supplier} is recorded`,
        description: saved.photo ?? undefined,
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

  return (
    <>
      <PageChrome
        title="New bill"
        backHref="/books/bills"
        backLabel="Bills"
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
        <FormSec title="Supplier">
          <BkField label="Supplier" htmlFor="bill-supplier" error={errors.vendorId}>
            {draft ? (
              <Select id="bill-supplier" value={draft.supplier.id} disabled>
                <option value={draft.supplier.id}>{draft.supplier.name}</option>
              </Select>
            ) : (
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
            )}
          </BkField>
          <div className="field-row">
            <BkField label="Their invoice number" htmlFor="bill-theirs">
              <Input id="bill-theirs" aria-label="Their invoice number" value={form.theirNumber} onChange={(event) => set("theirNumber", event.target.value)} />
            </BkField>
            <BkField label="Their invoice date" htmlFor="bill-date" error={errors.billDate}>
              <Input id="bill-date" type="date" aria-label="Their invoice date" value={form.billDate} disabled={Boolean(draft)} onChange={(event) => set("billDate", event.target.value)} />
            </BkField>
          </div>
          <FdmsCheck code={form.fdmsCode} status={form.fdmsStatus} onCode={(code) => set("fdmsCode", code)} onStatus={(status) => set("fdmsStatus", status)} />
          {box ? (
            <BkBox tone={box.tone} icon={box.tone === "ok" ? "check" : "warn"}>
              <b>{box.lead}</b>
              {box.rest}
            </BkBox>
          ) : !draft && supplier && !supplier.vatNumber ? (
            <BkBox tone="warn" icon="warn">
              <b>No VAT number on file for {supplier.name}.</b> Their VAT counts only on a valid fiscal invoice.
            </BkBox>
          ) : null}
        </FormSec>

        {fromReceipt ? (
          <FormSec title="From">
            <BkBox icon="list">
              <b>{fromReceipt.number}</b>
              {fromReceipt.counted ? `, counted in on ${fromReceipt.counted}` : ""}
              {fromReceipt.by ? ` by ${fromReceipt.by}` : ""}.
            </BkBox>
          </FormSec>
        ) : null}

        <WideSec title="Lines">
            <>
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
                    {fromReceipt ? <th style={{ width: 136 }}>Account</th> : null}
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
                  Add a line
                </Button>
              </div>
            </>
        </WideSec>

        <FormSec title="Terms">
          <div className="field-row">
            <BkField label="Currency">
              {draft ? (
                // A goods receipt's bill is in the currency it was counted in.
                <BkSeg label="Currency" value={draft.currency} onChange={() => undefined} options={options.currencies.map((code) => ({ value: code, label: code === "ZWG" ? "ZiG" : code, disabled: code !== draft.currency }))} />
              ) : (
                <BkSeg label="Currency" value={form.currency} onChange={(code) => set("currency", code)} options={options.currencies.map((code) => ({ value: code, label: code === "ZWG" ? "ZiG" : code }))} />
              )}
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
    return <BillFormPage options={options.data} draft={draft.data ?? null} />;
  }
  return (
    <>
      <PageChrome title="New bill" backHref="/books/bills" backLabel="Bills" />
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
