"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { formatMoney, invoiceOutstanding, type LeadDocument } from "./document-types";
import { refreshAfterDocumentChange } from "@/lib/crm/refresh";

const PAYMENT_METHODS = ["Cash", "Bank transfer", "Mobile money", "Card", "Cheque", "Other"];

export function RecordPaymentSheet({
  open,
  onOpenChange,
  basePath,
  document,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The record's API base, e.g. /api/v2/crm/deals/<id>. */
  basePath: string;
  document: LeadDocument | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const outstanding = document?.invoice ? invoiceOutstanding(document.invoice) : 0;

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [receivedAt, setReceivedAt] = useState("");
  const [reference, setReference] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    // Default to settling the invoice in full — the common case — while
    // leaving part payments a single edit away.
    setAmount(outstanding > 0 ? outstanding.toFixed(2) : "");
    setMethod(PAYMENT_METHODS[0]);
    setReceivedAt(new Date().toISOString().slice(0, 10));
    setReference("");
    setErrors([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, document?.id]);

  const record = useMutation({
    mutationFn: () =>
      fetchJson<{ data: Record<string, unknown> }>(`${basePath}/receipt`, {
        method: "POST",
        body: JSON.stringify({
          invoiceDocumentId: document?.id,
          amount: Number(amount),
          method,
          receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
          reference: reference.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      const settled = Number(amount) >= outstanding - 0.009;
      refreshAfterDocumentChange(queryClient);
      toast({
        title: "Payment recorded",
        description: settled
          ? "Invoice settled in full — this closes as won."
          : `${formatMoney(outstanding - Number(amount), document?.currency ?? "USD")} still outstanding.`,
      });
      onOpenChange(false);
    },
    onError: (error) => setErrors([getApiErrorMessage(error)]),
  });

  const validate = (): string[] => {
    const found: string[] = [];
    const value = Number(amount);
    if (!amount.trim() || !Number.isFinite(value)) found.push("Enter the amount received.");
    else if (value <= 0) found.push("The amount must be greater than zero.");
    else if (value > outstanding + 0.009) {
      found.push(
        `That's more than the ${formatMoney(outstanding, document?.currency ?? "USD")} still outstanding.`,
      );
    }
    if (!method) found.push("Choose how the payment was made.");
    return found;
  };

  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a payment"
      description={document?.invoice
        ? `Against invoice ${document.invoice.invoiceNumber} — ${formatMoney(
            outstanding,
            document.currency,
          )} outstanding.`
        : "Against this invoice."}
      size="md"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        const found = validate();
        setErrors(found);
        if (found.length === 0) record.mutate();
      }}
      footer={<>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button type="submit" disabled={record.isPending}>
          {record.isPending ? "Recording…" : "Record payment"}
        </Button>
      </>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="payment-amount">Amount *</Label>
        <Input
          id="payment-amount"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          className="font-mono"
          placeholder="0.00"
        />
        {outstanding > 0 && Number(amount) < outstanding ? (
          <button
            type="button"
            className="text-sm text-[var(--text-muted)] underline"
            onClick={() => setAmount(outstanding.toFixed(2))}
          >
            Pay the full {formatMoney(outstanding, document?.currency ?? "USD")}
          </button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="payment-method">Method *</Label>
          <Select value={method} onValueChange={setMethod}>
            <SelectTrigger id="payment-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payment-date">Received on</Label>
          <Input
            id="payment-date"
            type="date"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="payment-reference">Reference</Label>
        <Input
          id="payment-reference"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Transfer reference, cheque number…"
          maxLength={120}
        />
      </div>
    </RecordDialog>
  );
}
