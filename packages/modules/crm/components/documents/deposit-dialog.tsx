"use client";

import { useState } from "react";

import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { RecordDialog } from "@corelithzw/ui/components/record-dialog";
import type { CrmDocumentLineInput } from "../../accounting-bridge";

import { formatMoney, type LeadDocument } from "./document-types";

/**
 * Asking for money down.
 *
 * A deposit is billed, not just received: a receipt in this system belongs to
 * an invoice, and it should — a payment with nothing to settle posts nowhere
 * and reconciles against nothing. So taking a deposit means raising an invoice
 * for part of the quote, and this works out that part.
 *
 * The rest of the job is invoiced later against what is left, and the deal's
 * billing line shows both.
 */
export function DepositDialog({
  open,
  onOpenChange,
  quotation,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quotation: LeadDocument | null;
  /** Hands back the single line the deposit invoice is raised for. */
  onConfirm: (line: CrmDocumentLineInput) => void;
}) {
  const [percent, setPercent] = useState("50");
  const [errors, setErrors] = useState<string[]>([]);

  const total = quotation?.quotation?.total ?? quotation?.amount ?? 0;
  const currency = quotation?.currency ?? "USD";
  const fraction = Number(percent) / 100;
  const amount = Number.isFinite(fraction) ? Math.round(total * fraction * 100) / 100 : 0;

  return (
    <RecordDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setPercent("50");
          setErrors([]);
        }
      }}
      title="Request a deposit"
      description="Raises an invoice for part of the quote. The balance is invoiced when the job is done."
      size="sm"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (!(fraction > 0) || fraction > 1) {
          setErrors(["A deposit is between 1 and 100 per cent of the quote."]);
          return;
        }
        if (amount <= 0) {
          setErrors(["That works out to nothing — check the quote's value."]);
          return;
        }
        setErrors([]);
        onConfirm({
          description: `Deposit — ${percent}% of ${
            quotation?.quotation?.quotationNumber ?? "the quotation"
          }`,
          quantity: 1,
          unitPrice: amount,
        });
        onOpenChange(false);
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit">Raise the deposit invoice</Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor="deposit-percent">Deposit</Label>
        <div className="flex items-center gap-2">
          <Input
            id="deposit-percent"
            type="number"
            min={1}
            max={100}
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
            className="w-24"
          />
          <span className="text-sm text-[var(--text-muted)]">
            % of {formatMoney(total, currency)}
          </span>
        </div>
        <p className="font-mono text-sm tabular-nums">{formatMoney(amount, currency)}</p>
      </div>
    </RecordDialog>
  );
}
