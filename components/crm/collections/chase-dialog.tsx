"use client";

import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@corelithzw/react";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import {
  COLLECTION_OUTCOMES,
  COLLECTION_OUTCOME_LABELS,
  validateCollectionNote,
} from "@/lib/crm/collections";
import { refreshAfterDocumentChange } from "@/lib/crm/refresh";
import { todayKey } from "@/components/crm/money/money";

type Outcome = (typeof COLLECTION_OUTCOMES)[number];

/** The invoice being chased, as much of it as the dialog says back. */
export type ChaseTarget = {
  documentId: string;
  invoiceNumber: string;
  /** Who owes it — the customer, or the deal when there is no customer. */
  owedBy: string | null;
};

/**
 * Log a chase against an invoice: what happened when somebody rang about the
 * money, and — when they promised — the day they promised it by.
 *
 * One dialog for both places a chase is logged, the Collections list and the
 * invoice's own page, so the two cannot drift into asking different things.
 * A promise books a task for its day on the server; the toast says so, since
 * that is the part of saving this that nobody would otherwise know happened.
 */
export function ChaseDialog({
  target,
  onOpenChange,
}: {
  target: ChaseTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [outcome, setOutcome] = useState<Outcome>("NO_ANSWER");
  const [promisedAt, setPromisedAt] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  // Every chase starts blank: nothing typed about one invoice follows
  // somebody to the next.
  const openFor = target?.documentId ?? null;
  const [seededFor, setSeededFor] = useState<string | null>(openFor);
  if (openFor !== seededFor) {
    setSeededFor(openFor);
    setOutcome("NO_ANSWER");
    setPromisedAt("");
    setNotes("");
    setErrors([]);
  }

  const save = useMutation({
    mutationFn: (chase: ChaseTarget) =>
      fetchJson("/api/v2/crm/collections", {
        method: "POST",
        body: JSON.stringify({
          documentId: chase.documentId,
          outcome,
          promisedAt:
            outcome === "PROMISED_TO_PAY" && promisedAt
              ? new Date(`${promisedAt}T00:00:00.000Z`).toISOString()
              : null,
          notes: notes.trim() || null,
        }),
      }),
    onSuccess: () => {
      toast({
        title: `Chase logged on ${target?.invoiceNumber ?? "the invoice"}`,
        description:
          outcome === "PROMISED_TO_PAY"
            ? "A task is booked for the day they promised."
            : COLLECTION_OUTCOME_LABELS[outcome],
      });
      refreshAfterDocumentChange(queryClient);
      queryClient.invalidateQueries({ queryKey: ["crm", "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["crm-tasks"] });
      onOpenChange(false);
    },
    onError: (failure) => setErrors([getApiErrorMessage(failure)]),
  });

  return (
    <RecordDialog
      open={Boolean(target)}
      onOpenChange={onOpenChange}
      title={target ? `Chase ${target.invoiceNumber}` : "Chase"}
      description={target?.owedBy ? `Owed by ${target.owedBy}` : undefined}
      size="sm"
      errors={errors}
      onSubmit={(event) => {
        event.preventDefault();
        if (!target) return;
        const problem = validateCollectionNote({
          outcome,
          promisedAt: outcome === "PROMISED_TO_PAY" ? promisedAt || null : null,
        });
        setErrors(problem ? [problem] : []);
        if (!problem) save.mutate(target);
      }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Log the chase"}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-outcome`}>What happened</Label>
        <Select value={outcome} onValueChange={(next) => setOutcome(next as Outcome)}>
          <SelectTrigger id={`${id}-outcome`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COLLECTION_OUTCOMES.map((value) => (
              <SelectItem key={value} value={value}>
                {COLLECTION_OUTCOME_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {outcome === "PROMISED_TO_PAY" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-promised`}>Promised by</Label>
          <Input
            id={`${id}-promised`}
            type="date"
            className="font-mono"
            min={todayKey()}
            value={promisedAt}
            onChange={(event) => setPromisedAt(event.target.value)}
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-notes`}>Notes</Label>
        <Textarea
          id={`${id}-notes`}
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
    </RecordDialog>
  );
}
