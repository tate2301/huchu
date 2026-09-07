"use client";

import { SCORE_BAND_LABELS, type LeadScore } from "../../lead-scoring";
import { cn } from "@corelithzw/ui/lib/utils";

import { Stack } from "@corelithzw/react";

const BAND_TONE: Record<LeadScore["band"], string> = {
  HOT: "text-[var(--status-success-text)]",
  WARM: "text-[var(--status-warning-text)]",
  COLD: "text-[var(--text-muted)]",
};

/**
 * The score, and every reason for it.
 *
 * A number on its own invites arguments; the list underneath ends them. If a
 * rep disagrees with the score they can see exactly which line to change.
 */
export function LeadScoreCard({ score }: { score: LeadScore }) {
  return (
    <div className="space-y-2">
      {/* The number carries the band's colour, not just the word beside it.
          A score is read at a glance and then, occasionally, argued with —
          so the glance gets the colour and the argument gets the list. */}
      <div className="flex items-baseline gap-2">
        <span className={cn("font-mono text-xl leading-none", BAND_TONE[score.band])}>
          {score.total}
        </span>
        <span className={cn("text-sm font-medium", BAND_TONE[score.band])}>
          {SCORE_BAND_LABELS[score.band]}
        </span>
      </div>

      {score.signals.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing on this lead has scored yet.
        </p>
      ) : (
        // Evidence, muted. These four rows used to be drawn as darkly as the
        // figures in the panel above them, so a lead's summary was a wall of
        // equally loud numbers and nothing in it led. Only a signal counting
        // *against* the lead keeps a colour, because that is the one worth
        // stopping on.
        <Stack as="ul" gap="xs">
          {score.signals.map((signal) => (
            <li
              key={signal.key}
              className="flex items-baseline justify-between gap-2 text-sm text-[var(--text-subtle)]"
            >
              <span>{signal.label}</span>
              <span
                className={cn(
                  "font-mono tabular-nums",
                  signal.points < 0 && "font-medium text-[var(--status-error-text)]",
                )}
              >
                {signal.points > 0 ? `+${signal.points}` : signal.points}
              </span>
            </li>
          ))}
        </Stack>
      )}
    </div>
  );
}
