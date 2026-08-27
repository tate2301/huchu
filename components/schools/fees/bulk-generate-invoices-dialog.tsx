"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@corelithzw/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { SaveError } from "@/components/schools/common/states";
import { useOpenTransition } from "@/components/schools/common/use-open-transition";
import { bulkGenerateInvoices } from "@/lib/schools/fees-v2";

import { ClassPicker, FeeStructurePicker, TermPicker } from "./fee-pickers";

/**
 * A term's bills, in one pass.
 *
 * Two things were wrong with this form before the pickers existed. The class
 * dropdown carried `<SelectItem value="">` for "All classes", which Radix
 * refuses outright — the component throws on an empty item value, so the whole
 * dialog crashed the moment that list opened. And the term list was derived
 * from whichever fee structures happened to load, so a term with no sheet on it
 * yet simply was not offered.
 *
 * Both are now real pickers over their own endpoints, and "every year group" is
 * the absence of a choice rather than an option with no value.
 */
export function BulkGenerateInvoicesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [feeStructureId, setFeeStructureId] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [issueNow, setIssueNow] = useState(false);

  // Cleared as it opens rather than as it closes. Both put a fresh form in front
  // of the bursar; doing it on the way in means the reset cannot be skipped by a
  // dialog that unmounts before its effect runs.
  useOpenTransition(open, () => {
    setTermId("");
    setClassId("");
    setFeeStructureId("");
    setDueDate("");
    setNotes("");
    setSkipExisting(true);
    setIssueNow(false);
  });

  const generate = useMutation({
    mutationFn: () =>
      bulkGenerateInvoices({
        termId,
        classId: classId || undefined,
        feeStructureId,
        issueDate,
        dueDate,
        issueNow,
        skipExisting,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "fees"] });
    },
  });

  const result = generate.data?.data;

  const close = () => {
    if (generate.isPending) return;
    generate.reset();
    onOpenChange(false);
  };

  if (result) {
    return (
      <RecordDialog
        open={open}
        onOpenChange={close}
        title="Invoices generated"
        size="md"
        footer={
          <Button type="button" onClick={close}>
            Close
          </Button>
        }
      >
        <Alert tone={result.errors.length > 0 ? "warn" : "success"} title={result.message}>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Raised</span>
              <span className="font-mono tabular-nums">{result.created}</span>
            </div>
            <div className="flex justify-between">
              <span>Skipped — already billed this term</span>
              <span className="font-mono tabular-nums">{result.skipped}</span>
            </div>
            <div className="flex justify-between">
              <span>Eligible pupils</span>
              <span className="font-mono tabular-nums">{result.summary.totalEligible}</span>
            </div>
          </div>
        </Alert>

        <p className="text-sm text-muted-foreground">
          {result.summary.feeStructure.name} · {result.summary.feeStructure.class} ·{" "}
          {result.summary.feeStructure.term}
        </p>

        {result.errors.length > 0 ? (
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[color:var(--tone-danger)]">
              {result.errors.length} could not be raised
            </h3>
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
              {result.errors.map((error) => (
                <li key={error.studentId}>
                  {error.studentNo}: {error.error}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </RecordDialog>
    );
  }

  return (
    <RecordDialog
      open={open}
      onOpenChange={close}
      title="Generate a term's invoices"
      description="One bill per pupil in the year group, from the fee sheet you choose."
      size="md"
      onSubmit={(event) => {
        event.preventDefault();
        if (!termId || !feeStructureId || !issueDate || !dueDate) return;
        generate.mutate();
      }}
      footer={
        <>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={generate.isPending}>
            {generate.isPending ? "Generating…" : "Generate invoices"}
          </Button>
        </>
      }
    >
      {generate.error ? <SaveError what="The invoices" error={generate.error} /> : null}

      <TermPicker
        id="bulk-term"
        value={termId}
        onChange={(next) => {
          setTermId(next);
          setFeeStructureId("");
        }}
        required
      />

      <ClassPicker
        id="bulk-class"
        label="Year group"
        value={classId}
        onChange={(next) => {
          setClassId(next);
          setFeeStructureId("");
        }}
        hint="Leave it empty to bill every year group that has a sheet for this term."
      />

      <FeeStructurePicker
        id="bulk-structure"
        value={feeStructureId}
        onChange={setFeeStructureId}
        termId={termId || undefined}
        classId={classId || undefined}
        required
        disabled={!termId}
        hint={termId ? undefined : "Choose the term first."}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <Label htmlFor="bulk-issue-date">
            Issue date <span className="text-[color:var(--tone-danger)]">*</span>
          </Label>
          <Input
            id="bulk-issue-date"
            type="date"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
            required
          />
        </div>
        <div className="field">
          <Label htmlFor="bulk-due-date">
            Due date <span className="text-[color:var(--tone-danger)]">*</span>
          </Label>
          <Input
            id="bulk-due-date"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            required
          />
        </div>
      </div>

      <div className="field">
        <Label htmlFor="bulk-notes">Notes</Label>
        <Input
          id="bulk-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Additional notes for these invoices"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="bulk-skip-existing"
            checked={skipExisting}
            onCheckedChange={(checked) => setSkipExisting(checked === true)}
          />
          <Label htmlFor="bulk-skip-existing" className="cursor-pointer font-normal">
            Skip pupils who already have an invoice for this term
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="bulk-issue-now"
            checked={issueNow}
            onCheckedChange={(checked) => setIssueNow(checked === true)}
          />
          <Label htmlFor="bulk-issue-now" className="cursor-pointer font-normal">
            Issue them straight away, rather than leaving them drafts
          </Label>
        </div>
      </div>
    </RecordDialog>
  );
}
