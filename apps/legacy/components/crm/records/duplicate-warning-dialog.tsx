"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DuplicateConfidence } from "@/lib/crm/duplicates";
import { DUPLICATE_CONFIDENCE_TONE } from "@/lib/crm/tones";

export type DuplicateEntry = {
  record: { id: string; [key: string]: unknown };
  confidence: DuplicateConfidence;
  reasons: string[];
};

const CONFIDENCE_LABELS: Record<DuplicateConfidence, string> = {
  EXACT: "Almost certainly the same",
  STRONG: "Probably the same",
  POSSIBLE: "Might be the same",
};

/**
 * Shown when a create would produce a likely duplicate. The user can open the
 * existing record instead, or say "no, this really is a different one" —
 * blocking outright would be wrong, since two people genuinely do share names.
 */
export function DuplicateWarningDialog({
  open,
  onOpenChange,
  duplicates,
  entityLabel,
  renderRecord,
  onUseExisting,
  onCreateAnyway,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateEntry[];
  entityLabel: string;
  renderRecord: (record: DuplicateEntry["record"]) => { title: string; subtitle: string | null };
  onUseExisting?: (id: string) => void;
  onCreateAnyway: () => void;
  isPending?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            This {entityLabel} may already be on file
          </DialogTitle>
          <DialogDescription>
            {duplicates.length === 1
              ? "One existing record looks like a match."
              : `${duplicates.length} existing records look like matches.`}{" "}
            Use one of them, or carry on if this really is someone new.
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-72 space-y-2 overflow-y-auto">
          {duplicates.map((entry) => {
            const rendered = renderRecord(entry.record);
            return (
              <li
                key={entry.record.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--card-radius)] border border-[var(--border)] p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{rendered.title}</span>
                    <Badge tone={DUPLICATE_CONFIDENCE_TONE[entry.confidence] ?? "neutral"} size="sm">
                      {CONFIDENCE_LABELS[entry.confidence]}
                    </Badge>
                  </div>
                  {rendered.subtitle ? (
                    <p className="text-sm text-[var(--text-muted)]">{rendered.subtitle}</p>
                  ) : null}
                  <p className="text-sm text-[var(--text-muted)]">
                    {entry.reasons.join(" · ")}
                  </p>
                </div>
                {onUseExisting ? (
                  <Button size="sm" variant="outline" onClick={() => onUseExisting(entry.record.id)}>
                    Use this one
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Go back
          </Button>
          <Button onClick={onCreateAnyway} disabled={isPending}>
            {isPending ? "Creating…" : "Create anyway"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
