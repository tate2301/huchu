"use client";

import { RecordDialog } from "@/components/crm/records/record-dialog";
import { Button } from "@/components/ui/button";

/**
 * `Renumber the hall`.
 *
 * A confirmation rather than a button, because the cost is invisible from the
 * screen: a hall already numbered in candidate order is one an invigilator has
 * walked with a list in their hand, and a desk card that no longer matches the
 * list is a candidate sitting in somebody else's seat on the morning.
 *
 * So the dialog says what it will do to seats that already exist, and the verb
 * is the last thing on it.
 */
export function RenumberHallDialog({
  open,
  onOpenChange,
  seats,
  isSaving,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many seats are already laid out. */
  seats: number;
  isSaving: boolean;
  onConfirm: () => void;
}) {
  return (
    <RecordDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Renumber the hall"
      description="Lays the seats out again in candidate order, from the first candidate."
      size="sm"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Leave it as it is
          </Button>
          <Button type="button" disabled={isSaving} onClick={onConfirm}>
            {isSaving ? "Renumbering…" : "Renumber it"}
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <p>
          {seats === 0
            ? "Nothing is laid out yet, so this only seats whoever is unseated."
            : `${seats} ${seats === 1 ? "seat has" : "seats have"} already been numbered.`}
        </p>
        <p className="text-xs text-[color:var(--text-muted)]">
          Anybody holding a printed desk card or a seating list will be holding the wrong one.
          Reprint them before the sitting.
        </p>
      </div>
    </RecordDialog>
  );
}
