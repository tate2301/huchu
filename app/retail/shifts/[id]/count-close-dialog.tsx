"use client";

import * as React from "react";
import { Dialog } from "radix-ui";

import { Button } from "@/components/workspace/button";
import { Field } from "@/components/workspace/fields/field";
import { MoneyInput, normaliseMoney } from "@/components/workspace/fields/money-input";
import { TextArea } from "@/components/workspace/fields/text-area";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { ShiftRecordView } from "@/lib/retail/shift-record";
import { formatMoney } from "@/lib/workspace/format";

/**
 * Count and close: the existing close, kept until the floor spec's count
 * page (FLR-04) replaces it. The cash counted in the drawer and a note; the
 * server works out the difference against what should be there.
 */
export function CountCloseDialog({
  shift,
  open,
  onOpenChange,
  onClosed,
}: {
  shift: ShiftRecordView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: (message: string) => void;
}) {
  const [counted, setCounted] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const change = (next: boolean) => {
    if (busy) return;
    if (next) {
      setCounted("");
      setNote("");
      setError(null);
      setFailure(null);
    }
    onOpenChange(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = normaliseMoney(counted);
    const value = Number(text);
    if (!text || !Number.isFinite(value) || value < 0) {
      setError("Counted cash is needed.");
      return;
    }
    setError(null);
    setFailure(null);
    setBusy(true);
    try {
      const closed = await fetchJson<{ variance?: number | string | null }>(`/api/v2/retail/shifts/${shift.id}/close`, {
        method: "POST",
        body: JSON.stringify({ countedCash: value, notes: note.trim() || undefined }),
      });
      const variance = Number(closed.variance ?? value - shift.expectedCash);
      const verdict =
        Math.round(variance * 100) === 0
          ? "balanced"
          : variance < 0
            ? `short by ${formatMoney(-variance)}`
            : `over by ${formatMoney(variance)}`;
      setBusy(false);
      onOpenChange(false);
      onClosed(`${shift.shiftNo} is closed, ${verdict}.`);
    } catch (caught) {
      setBusy(false);
      setFailure(getApiErrorMessage(caught));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className="cx-scrim" />
        <div className="cx-confirm-layer">
          <Dialog.Content className="cx-confirm" aria-describedby={undefined}>
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Dialog.Title className="cx-confirm__title">
                Count and close {shift.registerName} {shift.shiftNo}
              </Dialog.Title>
              <p className="cx-confirm__body">
                Should be in the drawer: <span className="cx-rf-mono">{formatMoney(shift.expectedCash)}</span>. Count the
                cash and type what is there; the difference is worked out for you.
              </p>
              <Field label="Counted cash" error={error}>
                {(control) => (
                  <MoneyInput {...control} value={counted} onValueChange={setCounted} autoFocus disabled={busy} />
                )}
              </Field>
              <Field label="Note" optional>
                {(control) => (
                  <TextArea {...control} rows={2} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} />
                )}
              </Field>
              {failure ? (
                <p role="alert" className="cx-confirm__error">
                  {failure}
                </p>
              ) : null}
              <div className="cx-confirm__actions">
                <Dialog.Close asChild>
                  <Button size="field" disabled={busy}>
                    Keep it open
                  </Button>
                </Dialog.Close>
                <Button size="field" variant="primary" type="submit" busy={busy}>
                  Close the shift
                </Button>
              </div>
            </form>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
