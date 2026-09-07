"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "@corelithzw/ui/components/use-toast";
import { ApiError, fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { WORK_ORDER_STATUS_LABELS } from "../../work-orders";

import type { JobRecord, JobStatus } from "./job-types";

/**
 * The five moves a job can make, as five requests.
 *
 * They are separate routes on the server because each has its own
 * preconditions, so they are separate mutations here rather than one PATCH
 * with a status in the body. The sheet this replaces did it the other way and
 * had to guess which extra fields a status wanted; worse, it read the refusal
 * off `err.data`, which does not exist — `ApiError` carries the payload on
 * `details` — so every "this job isn't ready to close" arrived as a flat
 * "couldn't save" with the actual reasons thrown away.
 *
 * Refusals are the interesting half of this. The API answers a premature
 * completion with what is still outstanding and an unpriceable invoice with
 * the lines it could not price; both are far more use on site than an error
 * toast, so they are surfaced as state rather than raised.
 */

/** What a refused move told us, in the words the API used. */
export type JobRefusal = {
  message: string;
  /** Completion: what is still outstanding. Invoicing: why it cannot be billed. */
  blockers: string[];
  /** Invoicing: work that was done and has no price behind it. */
  unpriced: string[];
};

function refusalFrom(error: unknown): JobRefusal {
  const details =
    error instanceof ApiError && error.details && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : null;

  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  /**
   * A validation failure says which field and why, as zod's own issues under
   * the payload's `details`. Read as blockers they become the same list every
   * other refusal produces; left unread the user gets "Validation failed" and
   * nothing else, which is a message that cannot be acted on.
   */
  const zodIssues = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const { path, message } = entry as { path?: unknown; message?: unknown };
          if (typeof message !== "string") return [];
          const where = Array.isArray(path) ? path.join(".") : "";
          return [where ? `${where}: ${message}` : message];
        })
      : [];

  return {
    message: getApiErrorMessage(error),
    blockers: [...list(details?.blockers), ...zodIssues(details?.details)],
    unpriced: list(details?.unpriced),
  };
}

/**
 * What a move hands back. `transitioned` is false when the job was already
 * where it was being sent and only its details moved.
 */
type JobMoved = JobRecord & { transitioned?: boolean };

export type ScheduleInput = {
  scheduledStart: string;
  scheduledEnd?: string | null;
  assignedToId?: string | null;
  crewIds?: string[];
  note?: string | null;
};

export type CompleteInput = {
  signedByName: string;
  completionNotes?: string | null;
  customerRating?: number | null;
  itemProgress?: Array<{ id: string; completedQuantity: number }>;
};

export type InvoiceResult = {
  documentId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  total?: number | null;
  currency?: string;
  alreadyInvoiced: boolean;
};

export function useJobActions(jobId: string) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [refusal, setRefusal] = useState<JobRefusal | null>(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["crm", "job", jobId] });
    queryClient.invalidateQueries({ queryKey: ["crm", "jobs"] });
  };

  const post = <T,>(action: string, body: unknown) =>
    fetchJson<T>(`/api/v2/crm/work-orders/${jobId}/${action}`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    });

  /**
   * Every move but invoicing lands the same way: the job comes back changed.
   *
   * `transitioned: false` means the job was already in that state and only the
   * details moved — a booking dragged from Tuesday to Thursday, a blocker
   * reworded. Announcing "Job is now scheduled" there is a lie about what just
   * happened, and on a rescheduled job it is the one thing the user knows is
   * not news.
   */
  const moved = (status: JobStatus, result?: JobMoved, unchangedTitle?: string) => {
    setRefusal(null);
    refresh();
    const transitioned = result?.transitioned !== false;
    toast({
      title:
        transitioned || !unchangedTitle
          ? `Job is now ${WORK_ORDER_STATUS_LABELS[status].toLowerCase()}`
          : unchangedTitle,
    });
  };

  const schedule = useMutation({
    mutationFn: (input: ScheduleInput) => post<JobMoved>("schedule", input),
    onSuccess: (result) => moved("SCHEDULED", result, "Booking moved"),
    onError: (error) => setRefusal(refusalFrom(error)),
  });

  const start = useMutation({
    mutationFn: (note?: string | null) => post<JobMoved>("start", { note: note ?? null }),
    onSuccess: (result) => moved("IN_PROGRESS", result, "Already on site"),
    onError: (error) => setRefusal(refusalFrom(error)),
  });

  const block = useMutation({
    mutationFn: (reason: string) => post<JobMoved>("block", { reason }),
    onSuccess: (result) => moved("BLOCKED", result, "Reason updated"),
    onError: (error) => setRefusal(refusalFrom(error)),
  });

  const complete = useMutation({
    mutationFn: (input: CompleteInput) => post<JobMoved>("complete", input),
    onSuccess: (result) => moved("COMPLETED", result, "Already completed"),
    onError: (error) => setRefusal(refusalFrom(error)),
  });

  const cancel = useMutation({
    mutationFn: (reason: string) => post<JobMoved>("cancel", { reason }),
    onSuccess: (result) => moved("CANCELLED", result, "Already cancelled"),
    onError: (error) => setRefusal(refusalFrom(error)),
  });

  /**
   * Ask the customer to sign it off themselves.
   *
   * The link is the whole product of this: there is no email plumbing behind
   * it, so it goes to the caller to send however the customer is actually
   * reachable — which in practice is WhatsApp.
   */
  const askForSignOff = useMutation({
    mutationFn: () => post<{ token: string; path: string }>("sign-off", {}),
    onSuccess: async (result) => {
      setRefusal(null);
      refresh();
      const url = `${window.location.origin}${result.path}`;
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied",
          description: "Send it to whoever is accepting the work.",
        });
      } catch {
        // Denied often enough on a phone that failing quietly would look like
        // the button did nothing — the same fallback the visit brief uses.
        toast({ title: "Link ready", description: url });
      }
    },
    onError: (error) => setRefusal(refusalFrom(error)),
  });

  const invoice = useMutation({
    mutationFn: (input?: { lines?: InvoiceLineInput[] }) =>
      post<InvoiceResult>("invoice", input ?? {}),
    onSuccess: (result) => {
      setRefusal(null);
      refresh();
      toast({
        title: result.alreadyInvoiced
          ? `Already billed as ${result.invoiceNumber ?? "an invoice"}`
          : `Invoice ${result.invoiceNumber ?? "raised"}`,
        description: result.alreadyInvoiced
          ? "This job had an invoice against it already, so nothing was raised twice."
          : "It is on the customer's account.",
      });
    },
    onError: (error) => setRefusal(refusalFrom(error)),
  });

  /**
   * Progress is not a lifecycle move, so it goes through the record itself.
   *
   * The job's other properties are edited through `useAttributeEditor`, which
   * PATCHes the same route — this stays separate only because a tick is not an
   * attribute and it batches several lines into one write.
   */
  const saveProgress = useMutation({
    mutationFn: (itemProgress: Array<{ id: string; completedQuantity: number }>) =>
      fetchJson<JobRecord>(`/api/v2/crm/work-orders/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({ itemProgress }),
      }),
    onSuccess: () => refresh(),
    onError: (error) =>
      toast({
        title: "Could not save that",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const isPending =
    schedule.isPending ||
    start.isPending ||
    block.isPending ||
    complete.isPending ||
    cancel.isPending ||
    invoice.isPending;

  return {
    schedule,
    start,
    block,
    complete,
    cancel,
    askForSignOff,
    invoice,
    saveProgress,
    isPending,
    refusal,
    clearRefusal: () => setRefusal(null),
  };
}

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
};
