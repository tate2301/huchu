"use client";

import { ConfirmDialog } from "@/components/workspace/confirm-dialog";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { REASON_MAX, REASON_MIN } from "@/lib/books/reversal";

/** What the core answers once a document is revised (books-final §4.1 rule 2, D7). */
export type Revised = { label: string; draft: { kind: string; id: string; label: string } };

/**
 * Revise, from a posted document's ⋯ menu: the old one is voided (a credit
 * note for a fiscalised invoice) and a new draft, linked back to it, opens to
 * be put right and issued. Its number comes at issue. A reason is kept.
 */
export function ReviseDialog({
  kind,
  id,
  number,
  noun,
  open,
  onOpenChange,
  onRevised,
}: {
  kind: "invoice" | "bill" | "quote" | "credit-note";
  id: string;
  number: string;
  noun: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRevised: (done: Revised) => void | Promise<void>;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      ask={{
        title: `Revise ${number}?`,
        body: `${number} is voided and stays, marked void. A new draft ${noun}, linked to it, opens for you to put right and issue. It takes its own number when it is issued.`,
        keep: "Keep it",
        go: "Void and revise",
        fill: "bad",
        field: { key: "reason", label: "Why", placeholder: "Wrong amount on line 2", min: REASON_MIN, max: REASON_MAX, needed: "Say why, in a few words." },
      }}
      onConfirm={async (reason) => {
        let done: Revised;
        try {
          done = await fetchJson<Revised>(`/api/books/core/${kind}/${id}`, { method: "POST", body: JSON.stringify({ action: "revise", reason }) });
        } catch (error) {
          throw new Error(getApiErrorMessage(error, "It was not revised. Check the connection and try again."));
        }
        await onRevised(done);
      }}
    />
  );
}
