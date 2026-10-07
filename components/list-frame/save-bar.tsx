"use client";

import { Button } from "@/components/workspace/button";

/**
 * The save bar (00-foundations 5.4.10): between the rows and the pager while
 * a list whose job is typing values (a price list) holds unsaved changes.
 * "3 prices changed · <note> · Discard · Save prices".
 */
export function SaveBar({
  count,
  changedLabel,
  note,
  save,
  saving,
  onDiscard,
  onSave,
}: {
  count: number;
  changedLabel: string;
  note: string;
  save: string;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <div role="region" aria-label="Unsaved changes" className="cx-lf-save">
      <span className="cx-lf-save__count">
        <span className="mono">{count}</span> {changedLabel}
      </span>
      <span className="cx-lf-save__note">{note}</span>
      <span className="cx-lf-spacer" />
      <Button onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button variant="primary" onClick={onSave} busy={saving}>
        {save}
      </Button>
    </div>
  );
}
