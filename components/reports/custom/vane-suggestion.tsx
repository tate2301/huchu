"use client";

import { Button, VaneMark } from "@/components/core";
import type { ReportSuggestion } from "@/lib/vane/status";

/**
 * Where a suggestion is: waiting to be kept, kept (on the page, saved when
 * the person publishes), or dismissed (Not now: it goes to Muted).
 */
export type SuggestionState = "waiting" | "kept" | "dismissed";

/**
 * Vane's suggestion in the builder (ReportBuildVane): the question it wrote,
 * at the top of the shelf's middle column, waiting to be kept. Vane only
 * drafts it; Keep puts it on the page as a table, as the person's own edit.
 * Dismissed, nothing shows.
 */
export function VaneSuggestion({
  suggestion,
  state,
  onKeep,
  onDismiss,
  busy = false,
}: {
  suggestion: ReportSuggestion;
  state: SuggestionState;
  onKeep: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  if (state === "dismissed") return null;
  if (state === "kept") {
    return (
      <div className="cl-req" role="status">
        <div className="cl-ans">
          <VaneMark />
          <span>Kept as a table on the board. Publish to save it.</span>
        </div>
      </div>
    );
  }
  return (
    <div className="cl-req" aria-label={`Vane's suggestion: ${suggestion.name}`}>
      <div className="cl-ans">
        <VaneMark />
        <span>{suggestion.note}</span>
      </div>
      <div className="cl-act">
        <Button variant="quiet" icon="muted" onClick={onDismiss} disabled={busy}>
          Not now
        </Button>
        <Button icon="keep" onClick={onKeep} disabled={busy}>
          Keep
        </Button>
      </div>
    </div>
  );
}
