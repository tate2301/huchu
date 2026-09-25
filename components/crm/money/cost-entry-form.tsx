"use client";

import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";

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
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";

import { CATEGORIES, CATEGORY_LABELS, todayKey, type Category } from "./money";
import { ReceiptField, type UploadedReceipt } from "./receipt-field";

/**
 * One line of spend, written where it happened — a requisition's report, a
 * project's spend — through the one door every money line uses
 * (`/api/v2/crm/cost-entries`, `addCostEntry` behind it).
 *
 * What the page already knows is fixed rather than asked: a line on a
 * requisition's report is against that requisition and its project, and one
 * added on a project is that project's. What is left is what only the person
 * holding the receipt knows — how much, on what, which day, and the photo.
 *
 * The day can be moved back and never forward: a rep writes Tuesday up on
 * Wednesday, and a line for Friday written on Wednesday is a guess.
 *
 * Each attempt carries a `clientEntryId`, kept across a failed retry and
 * replaced once a line lands, so a double press on a bad connection records
 * the spend once.
 */
export function CostEntryForm({
  fixed,
  defaultCategory = "MATERIALS",
  submitLabel = "Add the line",
  onSaved,
}: {
  fixed: {
    direction: "SPENT" | "RECEIVED";
    currency: string;
    projectId?: string | null;
    requisitionId?: string | null;
  };
  defaultCategory?: Category;
  submitLabel?: string;
  onSaved: () => void;
}) {
  const id = useId();
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<Category>(defaultCategory);
  const [description, setDescription] = useState("");
  const [day, setDay] = useState(todayKey);
  const [receipt, setReceipt] = useState<UploadedReceipt | null>(null);
  const [clientEntryId, setClientEntryId] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      fetchJson("/api/v2/crm/cost-entries", {
        method: "POST",
        body: JSON.stringify({
          date: day,
          direction: fixed.direction,
          category,
          amount: Number(amount),
          currency: fixed.currency,
          description: description.trim(),
          ...(fixed.projectId === undefined ? {} : { projectId: fixed.projectId }),
          requisitionId: fixed.requisitionId ?? null,
          receiptUrl: receipt?.url ?? null,
          receiptPathname: receipt?.pathname ?? null,
          clientEntryId,
        }),
      }),
    onSuccess: () => {
      setAmount("");
      setDescription("");
      setReceipt(null);
      setError(null);
      setClientEntryId(crypto.randomUUID());
      onSaved();
    },
    onError: (failure) => setError(getApiErrorMessage(failure)),
  });

  const ready = Number(amount) > 0 && description.trim().length > 0;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-amount`}>How much</Label>
          <Input
            id={`${id}-amount`}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            className="font-mono"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-category`}>On what</Label>
          <Select value={category} onValueChange={(next) => setCategory(next as Category)}>
            <SelectTrigger id={`${id}-category`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {CATEGORY_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-description`}>What it was</Label>
          <Input
            id={`${id}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="20 bags of screed, Builders Warehouse"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-day`}>Which day</Label>
          <Input
            id={`${id}-day`}
            type="date"
            className="font-mono"
            max={todayKey()}
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Receipt</Label>
        <ReceiptField value={receipt} onChange={setReceipt} />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-[var(--status-error-text)]">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="outline" disabled={!ready || save.isPending}>
        {save.isPending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
