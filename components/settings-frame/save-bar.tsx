"use client";

import { Button } from "@/components/workspace/button";

/**
 * The save bar at the foot of a settings page's form (00-foundations 5.10.1).
 *
 * Clean, one line in `--ink-3`: who last changed the page ("Last changed by
 * Tendai Mhlanga, 2 October."), "Saved just now." for a minute after a save,
 * or the page's "who can change this" sentence for a role that cannot.
 * Dirty: the warn dot, "<n> changes not saved", "Discard" and "Save changes".
 */
export function SaveBar({
  count,
  line,
  error,
  saving,
  onDiscard,
  onSave,
}: {
  /** Fields that differ from what is saved; 0 draws the clean line. */
  count: number;
  line: string | null;
  /** What a refused save said, beside the count. */
  error?: string | null;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
}) {
  if (count === 0) {
    return (
      <div className="cx-sf-bar">
        <span role="status" className="cx-sf-bar__line">
          {line ?? ""}
        </span>
      </div>
    );
  }
  return (
    <div role="region" aria-label="Unsaved changes" className="cx-sf-bar">
      <span role="status" className="cx-sf-bar__dirty">
        <span className="cx-sf-bar__dot" aria-hidden="true" />
        {changesNotSaved(count)}
        {error ? <span className="cx-sf-bar__error"> · {error}</span> : null}
      </span>
      <Button size="field" onClick={onDiscard} disabled={saving}>
        Discard
      </Button>
      <Button size="field" variant="primary" busy={saving} onClick={onSave}>
        Save changes
      </Button>
    </div>
  );
}

/** "1 change not saved", "2 changes not saved". */
export function changesNotSaved(count: number): string {
  return `${count} ${count === 1 ? "change" : "changes"} not saved`;
}
