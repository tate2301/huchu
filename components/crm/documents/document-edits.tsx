"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { refreshAfterDocumentChange } from "@/lib/crm/refresh";

/** Methods a payment is recorded with, as the payment sheet offers them. */
const METHODS = ["Cash", "Bank transfer", "Mobile money", "Card", "Cheque", "Other"];

function useDetails(documentId: string) {
  const client = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson<{ subject: string }>(`/api/v2/crm/documents/${documentId}/details`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: ({ subject }) => toast({ title: subject }),
    onError: (failure) => toast({ title: "Not changed", description: getApiErrorMessage(failure), variant: "destructive" }),
    onSettled: () => {
      refreshAfterDocumentChange(client);
      void client.invalidateQueries({ queryKey: ["crm", "documents", "record", documentId] });
      void client.invalidateQueries({ queryKey: ["crm", "documents", "preview", documentId] });
    },
  });
}

/** An invoice's due date, which can move while money is owed on it, whatever has been paid. */
export function InvoiceDueDateForm({ documentId, dueDate }: { documentId: string; dueDate: string | null }) {
  const id = useId();
  const [value, setValue] = useState(dueDate?.slice(0, 10) ?? "");
  const change = useDetails(documentId);
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (value) change.mutate({ dueDate: value });
      }}
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        <Label htmlFor={id}>Due on</Label>
        <Input id={id} type="date" value={value} onChange={(event) => setValue(event.target.value)} />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={!value || value === dueDate?.slice(0, 10) || change.isPending}>
        {change.isPending ? "Moving…" : "Move it"}
      </Button>
    </form>
  );
}

/**
 * A receipt's method and reference: labels only. The amount, the day and the
 * account it went to are in the books; a wrong one is voided in Accounting.
 */
export function ReceiptDetailsForm({ documentId, method, reference }: { documentId: string; method: string; reference: string | null }) {
  const id = useId();
  const [chosen, setChosen] = useState(method);
  const [ref, setRef] = useState(reference ?? "");
  const change = useDetails(documentId);
  const unchanged = chosen === method && ref.trim() === (reference ?? "");
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        change.mutate({ method: chosen, reference: ref.trim() || null });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-method`}>Paid by</Label>
        <select
          id={`${id}-method`}
          className="h-9 w-full rounded-md border border-[var(--border-default,var(--line))] bg-[var(--surface)] px-2 text-sm"
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
        >
          {[...new Set([method, ...METHODS])].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-reference`}>Reference</Label>
        <Input id={`${id}-reference`} value={ref} maxLength={120} placeholder="EcoCash 7H2K…, cheque 004512" onChange={(event) => setRef(event.target.value)} />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={unchanged || change.isPending}>
        {change.isPending ? "Saving…" : "Save"}
      </Button>
      <p className="text-sm text-[var(--text-muted)]">The amount, the day and where it was paid in are in the books; a wrong one is voided in Accounting.</p>
    </form>
  );
}
