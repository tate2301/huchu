"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Select } from "@corelithzw/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { SaveError } from "@/components/schools/common/states";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { formatSchoolMoney } from "@/lib/schools/format";
import {
  createSchoolFeeInvoice,
  createSchoolFeeReceipt,
  createSchoolFeeStructure,
  createSchoolFeeWaiver,
  updateSchoolFeeInvoice,
  updateSchoolFeeStructure,
  updateSchoolFeeWaiver,
  type FeeStructureLineInput,
  type SchoolFeeInvoiceRecord,
  type SchoolFeeStructureRecord,
  type SchoolFeeWaiverRecord,
} from "@/lib/schools/fees-v2";

import { ClassPicker, InvoicePicker, StudentPicker, TermPicker } from "@/components/schools/fees/fee-pickers";

/**
 * The fee module's forms.
 *
 * Every one of these was either missing or asked for a UUID. The rules they all
 * follow, taken from the dialog the design singled out as the one to copy:
 *
 *   - the consequence is stated before the buttons, not after them;
 *   - the safe button is named for what it does — "Keep it", "Leave it a
 *     draft" — because "Cancel" on a dialog about cancelling something means
 *     two opposite things;
 *   - nothing that identifies a record is typed. Pupils, terms, invoices and
 *     fee sheets are chosen from `./fee-pickers`.
 */

const PAYMENT_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "CARD", label: "Card" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
];

const WAIVER_TYPES: Array<{ value: SchoolFeeWaiverRecord["waiverType"]; label: string }> = [
  { value: "SCHOLARSHIP", label: "Scholarship" },
  { value: "DISCOUNT", label: "Discount" },
  { value: "HARDSHIP", label: "Hardship" },
  { value: "OTHER", label: "Other" },
];

/** Today, as the `YYYY-MM-DD` every date input and every route here expects. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/** An ISO timestamp back to the `YYYY-MM-DD` a date input can hold. */
function asDateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : "";
}

/* ── one bill for one pupil ──────────────────────────────────────────────── */

export function InvoiceFormDialog({
  open,
  onOpenChange,
  invoice,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null to raise a new bill; a record to correct one. */
  invoice: SchoolFeeInvoiceRecord | null;
}) {
  const queryClient = useQueryClient();
  const editing = invoice !== null;

  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [issueNow, setIssueNow] = useState(false);

  useOpenTransition(open, () => {
    setStudentId(invoice?.student.id ?? "");
    setTermId(invoice?.term.id ?? "");
    setDescription("");
    setAmount(invoice ? invoice.totalAmount.toFixed(2) : "");
    setDueDate(invoice ? asDateInput(invoice.dueDate) : "");
    setIssueNow(false);
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editing && invoice) {
        return updateSchoolFeeInvoice(invoice.id, {
          dueDate: dueDate || undefined,
          ...(invoice.status === "DRAFT"
            ? {
                description: description.trim() || undefined,
                amount: Number(amount),
              }
            : {}),
        });
      }
      return createSchoolFeeInvoice({
        studentId,
        termId,
        description: description.trim() || undefined,
        amount: Number(amount),
        issueDate: today(),
        dueDate: dueDate || today(),
        issueNow,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });
      onOpenChange(false);
    },
  });

  const draftOrNew = !editing || invoice?.status === "DRAFT";

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${invoice?.invoiceNo}` : "Create an invoice"}
      description={
        editing
          ? "A bill the family has seen only moves its due date; what it charges is changed with a waiver or a write-off."
          : "One bill for one pupil. It lands as a draft until you issue it."
      }
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {editing ? "Leave it as it is" : "Cancel"}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending
              ? "Saving…"
              : editing
                ? "Save the changes"
                : "Create invoice"}
          </Button>
        </>
      }
    >
      {save.error ? <SaveError what="The invoice" error={save.error} /> : null}

      <StudentPicker
        value={studentId}
        onChange={setStudentId}
        required
        disabled={editing}
        hint={editing ? "The pupil a bill is for cannot change once it exists." : undefined}
      />
      <TermPicker value={termId} onChange={setTermId} required disabled={editing} />

      <div className="field">
        <Label htmlFor="invoice-description">Description</Label>
        <Input
          id="invoice-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Extra tuition, Term 2"
          disabled={!draftOrNew}
        />
      </div>

      <div className="field">
        <Label htmlFor="invoice-amount">
          Amount <span className="text-[color:var(--tone-danger)]">*</span>
        </Label>
        <Input
          id="invoice-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
          disabled={!draftOrNew}
          aria-describedby="invoice-amount-help"
        />
        <p
          id="invoice-amount-help"
          className="mt-1 text-[length:var(--type-caption)] text-[color:var(--text-muted)]"
        >
          Added to the pupil’s outstanding balance when issued.
        </p>
      </div>

      <div className="field">
        <Label htmlFor="invoice-due">Due date</Label>
        <Input
          id="invoice-due"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      </div>

      {editing ? null : (
        <div className="flex items-center gap-2">
          <Checkbox
            id="invoice-issue-now"
            checked={issueNow}
            onCheckedChange={(checked) => setIssueNow(checked === true)}
          />
          <Label htmlFor="invoice-issue-now" className="cursor-pointer font-normal">
            Issue it straight away, rather than leaving it a draft
          </Label>
        </div>
      )}
    </RecordDialog>
  );
}

/* ── money in ────────────────────────────────────────────────────────────── */

export function ReceiptFormDialog({
  open,
  onOpenChange,
  presetInvoiceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when the dialog was opened from a bill, so the invoice is already chosen. */
  presetInvoiceId?: string;
}) {
  const queryClient = useQueryClient();

  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [reference, setReference] = useState("");
  const [receiptDate, setReceiptDate] = useState(today());

  useOpenTransition(open, () => {
    setInvoiceId(presetInvoiceId ?? "");
    setAmount("");
    setMethod("");
    setReference("");
    setReceiptDate(today());
  });

  const save = useMutation({
    mutationFn: async () =>
      createSchoolFeeReceipt({
        invoiceId,
        amount: Number(amount),
        method,
        reference: reference.trim() || undefined,
        receiptDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });
      onOpenChange(false);
    },
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a receipt"
      description="Money handed over, against the bill it settles."
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Posting…" : "Record receipt"}
          </Button>
        </>
      }
    >
      {save.error ? <SaveError what="The receipt" error={save.error} /> : null}

      <InvoicePicker value={invoiceId} onChange={setInvoiceId} required />

      <div className="field">
        <Label htmlFor="receipt-amount">
          Amount <span className="text-[color:var(--tone-danger)]">*</span>
        </Label>
        <Input
          id="receipt-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>

      <Select
        id="receipt-method"
        label="Payment method"
        value={method}
        onChange={(event) => setMethod(event.target.value)}
        required
        hint="A payment larger than the invoice is accepted; the surplus becomes credit on the family’s account."
      >
        <option value="">Select method</option>
        {PAYMENT_METHODS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <div className="field">
        <Label htmlFor="receipt-date">Received on</Label>
        <Input
          id="receipt-date"
          type="date"
          value={receiptDate}
          onChange={(event) => setReceiptDate(event.target.value)}
        />
      </div>

      <div className="field">
        <Label htmlFor="receipt-reference">Reference</Label>
        <Input
          id="receipt-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Bank slip or transaction number"
        />
      </div>
    </RecordDialog>
  );
}

/* ── a discount on a bill ────────────────────────────────────────────────── */

export function WaiverFormDialog({
  open,
  onOpenChange,
  waiver,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  waiver: SchoolFeeWaiverRecord | null;
}) {
  const queryClient = useQueryClient();
  const editing = waiver !== null;

  const [studentId, setStudentId] = useState("");
  const [termId, setTermId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [waiverType, setWaiverType] =
    useState<SchoolFeeWaiverRecord["waiverType"]>("SCHOLARSHIP");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [approveNow, setApproveNow] = useState(false);

  useOpenTransition(open, () => {
    setStudentId(waiver?.student.id ?? "");
    setTermId(waiver?.term.id ?? "");
    setInvoiceId(waiver?.invoice?.id ?? "");
    setWaiverType(waiver?.waiverType ?? "SCHOLARSHIP");
    setAmount(waiver ? waiver.amount.toFixed(2) : "");
    setReason(waiver?.reason ?? "");
    setApproveNow(false);
  });

  const save = useMutation({
    mutationFn: async () => {
      if (editing && waiver) {
        return updateSchoolFeeWaiver(waiver.id, {
          waiverType,
          amount: Number(amount),
          invoiceId: invoiceId || null,
          reason: reason.trim() || null,
        });
      }
      return createSchoolFeeWaiver({
        studentId,
        termId,
        invoiceId: invoiceId || null,
        waiverType,
        amount: Number(amount),
        reason: reason.trim() || null,
        status: approveNow ? "APPROVED" : "DRAFT",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });
      onOpenChange(false);
    },
  });

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? "Re-type this waiver" : "Waive part of a bill"}
      description="A waiver reduces what a family owes. It comes off the bill only when it is applied."
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save the changes" : "Create waiver"}
          </Button>
        </>
      }
    >
      {save.error ? <SaveError what="The waiver" error={save.error} /> : null}

      <StudentPicker value={studentId} onChange={setStudentId} required disabled={editing} />
      <TermPicker value={termId} onChange={setTermId} required disabled={editing} />
      <InvoicePicker
        label="Invoice"
        value={invoiceId}
        onChange={setInvoiceId}
        studentId={studentId || undefined}
        hint="Leave it empty and applying picks the oldest bill still owing for that term."
      />

      <Select
        id="waiver-type"
        label="Waiver type"
        value={waiverType}
        onChange={(event) =>
          setWaiverType(event.target.value as SchoolFeeWaiverRecord["waiverType"])
        }
        required
      >
        {WAIVER_TYPES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <div className="field">
        <Label htmlFor="waiver-amount">
          Amount <span className="text-[color:var(--tone-danger)]">*</span>
        </Label>
        <Input
          id="waiver-amount"
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </div>

      <div className="field">
        <Label htmlFor="waiver-reason">Reason</Label>
        <Textarea
          id="waiver-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why this family is being charged less"
        />
      </div>

      {editing ? null : (
        <div className="flex items-center gap-2">
          <Checkbox
            id="waiver-approve-now"
            checked={approveNow}
            onCheckedChange={(checked) => setApproveNow(checked === true)}
          />
          <Label htmlFor="waiver-approve-now" className="cursor-pointer font-normal">
            Approve it now, rather than leaving it a draft
          </Label>
        </div>
      )}
    </RecordDialog>
  );
}

/* ── the fee sheet ───────────────────────────────────────────────────────── */

type LineDraft = FeeStructureLineInput & { key: string };

let lineKeySeed = 0;
function newLine(): LineDraft {
  lineKeySeed += 1;
  return {
    key: `line-${lineKeySeed}`,
    feeCode: "",
    description: "",
    amount: 0,
    isMandatory: true,
  };
}

/**
 * A term's charges for one year group, line by line.
 *
 * The lines are edited in the dialog rather than on a second screen because a
 * fee sheet is only meaningful as a total: six lines that add to what a family
 * is billed. Splitting them apart would make "what does Form 2 cost" a question
 * you answer by adding up another page.
 */
export function StructureFormDialog({
  open,
  onOpenChange,
  structure,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  structure: SchoolFeeStructureRecord | null;
}) {
  const queryClient = useQueryClient();
  const editing = structure !== null;

  const [name, setName] = useState("");
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [activate, setActivate] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);

  useOpenTransition(open, () => {
    setName(structure?.name ?? "");
    setTermId(structure?.term.id ?? "");
    setClassId(structure?.class.id ?? "");
    setCurrency(structure?.currency ?? "USD");
    setActivate(false);
    setLines(
      structure?.lines && structure.lines.length > 0
        ? structure.lines.map((line, index) => ({
            key: `line-existing-${line.id}`,
            feeCode: line.feeCode,
            description: line.description,
            amount: line.amount,
            isMandatory: line.isMandatory,
            sortOrder: line.sortOrder ?? index,
          }))
        : [newLine()],
    );
  });

  // Charged as Decimal on the server; this is the running total the bursar
  // reads while typing, which is why it is allowed to be a plain sum here.
  const total = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const mandatory = lines
    .filter((line) => line.isMandatory !== false)
    .reduce((sum, line) => sum + (Number(line.amount) || 0), 0);

  const repricingLocked = editing && (structure?._count.invoices ?? 0) > 0;

  const save = useMutation({
    mutationFn: async () => {
      const payloadLines: FeeStructureLineInput[] = lines
        .filter((line) => line.feeCode.trim() && line.description.trim())
        .map((line, index) => ({
          feeCode: line.feeCode.trim().toUpperCase(),
          description: line.description.trim(),
          amount: Number(line.amount) || 0,
          isMandatory: line.isMandatory !== false,
          sortOrder: index,
        }));

      if (editing && structure) {
        return updateSchoolFeeStructure(structure.id, {
          name: name.trim(),
          ...(activate ? { status: "ACTIVE" as const } : {}),
          ...(repricingLocked ? {} : { lines: payloadLines }),
        });
      }
      return createSchoolFeeStructure({
        name: name.trim(),
        termId,
        classId,
        currency,
        status: activate ? "ACTIVE" : "DRAFT",
        lines: payloadLines,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });
      onOpenChange(false);
    },
  });

  const updateLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? `Edit ${structure?.name}` : "New fee sheet"}
      description="What a year group is charged for a term, line by line."
      size="lg"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? "Saving…" : editing ? "Save the sheet" : "Create fee sheet"}
          </Button>
        </>
      }
    >
      {save.error ? <SaveError what="The fee sheet" error={save.error} /> : null}

      <div className="field">
        <Label htmlFor="structure-name">
          Name <span className="text-[color:var(--tone-danger)]">*</span>
        </Label>
        <Input
          id="structure-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Form 2 fees — Term 2"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <TermPicker
          id="structure-term"
          value={termId}
          onChange={setTermId}
          required
          disabled={editing}
        />
        <ClassPicker
          id="structure-class"
          label="Year group"
          value={classId}
          onChange={setClassId}
          required
          disabled={editing}
        />
      </div>

      <div className="field">
        <Label htmlFor="structure-currency">Currency</Label>
        <Input
          id="structure-currency"
          value={currency}
          onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          maxLength={10}
          disabled={repricingLocked}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[length:var(--type-label-sm)] font-semibold">Lines</h3>
          <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
            {formatSchoolMoney(total, currency)} a term ·{" "}
            {formatSchoolMoney(mandatory, currency)} mandatory
          </span>
        </div>

        {repricingLocked ? (
          <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
            Invoices have been raised against this sheet, so its lines are fixed. Copy it to a
            new sheet to charge something different.
          </p>
        ) : null}

        {lines.map((line) => (
          <div key={line.key} className="grid gap-2 sm:grid-cols-[110px_1fr_110px_auto]">
            <Input
              aria-label="Fee code"
              value={line.feeCode}
              onChange={(event) => updateLine(line.key, { feeCode: event.target.value })}
              placeholder="TUITION"
              disabled={repricingLocked}
            />
            <Input
              aria-label="Description"
              value={line.description}
              onChange={(event) => updateLine(line.key, { description: event.target.value })}
              placeholder="Tuition, Term 2"
              disabled={repricingLocked}
            />
            <Input
              aria-label="Amount"
              type="number"
              step="0.01"
              min="0"
              value={line.amount}
              onChange={(event) =>
                updateLine(line.key, { amount: Number(event.target.value) })
              }
              disabled={repricingLocked}
            />
            <div className="flex items-center gap-2">
              <Checkbox
                id={`${line.key}-mandatory`}
                checked={line.isMandatory !== false}
                onCheckedChange={(checked) =>
                  updateLine(line.key, { isMandatory: checked === true })
                }
                disabled={repricingLocked}
              />
              <Label
                htmlFor={`${line.key}-mandatory`}
                className="cursor-pointer whitespace-nowrap font-normal"
              >
                Must pay
              </Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={repricingLocked || lines.length === 1}
                onClick={() =>
                  setLines((current) => current.filter((row) => row.key !== line.key))
                }
              >
                Remove
              </Button>
            </div>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={repricingLocked}
          onClick={() => setLines((current) => [...current, newLine()])}
        >
          Add a line
        </Button>
      </div>

      {structure?.status === "ACTIVE" ? null : (
        <div className="flex items-center gap-2">
          <Checkbox
            id="structure-activate"
            checked={activate}
            onCheckedChange={(checked) => setActivate(checked === true)}
          />
          <Label htmlFor="structure-activate" className="cursor-pointer font-normal">
            Make it active, so invoices can be raised against it
          </Label>
        </div>
      )}
    </RecordDialog>
  );
}

/* ── the destructive verbs, each with its reason ─────────────────────────── */

/**
 * One shape for write-off, void, reject and reverse.
 *
 * Each of them needs a sentence on the record saying why, which `dsConfirm`
 * cannot collect — a confirmation is a yes or a no. The consequence goes above
 * the field and the safe button is named for what it does.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  consequence,
  reasonLabel,
  reasonPlaceholder,
  keepLabel,
  confirmLabel,
  pendingLabel,
  reasonRequired = true,
  error,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  consequence: React.ReactNode;
  reasonLabel: string;
  /** An example of the sentence wanted — "Family asked for it to stay on account". */
  reasonPlaceholder?: string;
  keepLabel: string;
  confirmLabel: string;
  pendingLabel: string;
  reasonRequired?: boolean;
  error?: unknown;
  pending?: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useOpenTransition(open, () => setReason(""));

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      onSubmit={(event) => {
        event.preventDefault();
        if (reasonRequired && !reason.trim()) return;
        onConfirm(reason.trim());
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {keepLabel}
          </Button>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </>
      }
    >
      {error ? <SaveError what="The change" error={error} /> : null}
      <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
        {consequence}
      </p>
      <div className="field">
        <Label htmlFor="reason-dialog-reason">
          {reasonLabel}
          {reasonRequired ? <span className="text-[color:var(--tone-danger)]"> *</span> : null}
        </Label>
        <Textarea
          id="reason-dialog-reason"
          rows={3}
          value={reason}
          placeholder={reasonPlaceholder}
          onChange={(event) => setReason(event.target.value)}
          required={reasonRequired}
        />
      </div>
    </RecordDialog>
  );
}
