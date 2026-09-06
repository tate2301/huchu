"use client";

import { useState } from "react";
import type { CrmLeadStage } from "@corelithzw/db";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowRight, Check } from "@/lib/icons";
import { CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "@/lib/crm/pipeline";
import { cn } from "@/lib/utils";

// Won and Lost are outcomes, not steps along the way — the track shows the
// path, and the two terminal stages are reached from the menu rather than
// sitting at the end of it pretending to be steps six and seven.
const PATH_STAGES: CrmLeadStage[] = CRM_LEAD_STAGES.filter(
  (stage) => stage !== "WON" && stage !== "LOST",
);

/**
 * Where this lead has got to, and the one move that comes next.
 *
 * This used to be eight equally-loud buttons that wrapped onto two lines with
 * a divider stranded mid-flow. Eight controls of identical weight is eight
 * decisions offered at once, and none of them answered the question a stage
 * actually gets asked: how far along is this, and what happens next.
 *
 * So it is a track and a verb. The track is read, not pressed — filled to
 * where the lead has got to. The next move is one button, because from any
 * stage there is one obvious next stage. Everything else — jumping back,
 * marking it won or lost — is behind the stage name, which you press, the way
 * every other property on this page now works.
 *
 * Colour carries meaning rather than position: the track is brand-coloured
 * while the lead is live, green once it is won, and drains to muted when it is
 * lost. Nothing is coloured merely to show which button the cursor is on.
 */
export function StageProgress({
  stage,
  onChange,
  disabled,
  compact,
}: {
  stage: CrmLeadStage;
  onChange: (stage: CrmLeadStage) => void;
  disabled?: boolean;
  /**
   * The band's stage rail: every stage named inline, current one filled.
   *
   * Two different controls for two different jobs, not one control squeezed.
   * The band has horizontal room and no vertical room — 44px, and a control
   * that grew it would push the sticky stack down on record pages only — so it
   * gets the rail. The standing column is the reverse shape, so it keeps the
   * track, which stacks.
   */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const isWon = stage === "WON";
  const isLost = stage === "LOST";
  const isClosed = isWon || isLost;
  const currentIndex = PATH_STAGES.indexOf(stage);
  const next = currentIndex >= 0 ? PATH_STAGES[currentIndex + 1] : undefined;

  const fillClass = isWon
    ? "bg-[var(--status-success-border)]"
    : isLost
      ? "bg-[var(--border-strong)]"
      : "bg-[var(--action-primary-bg)]";

  /*
    Compact is the canvas's stage rail: every stage named, inline, with the
    current one filled.

    This replaces a segmented track plus a stage-name popover. The track could
    show *how far along* but never *what the stages are called*, so reading it
    meant opening the menu — and the menu was the only way to jump backwards.
    Naming all of them costs the width the track was using and answers both
    questions at a glance, which is what the band is for.

    The fill is the ink rather than the brand: a row of eight chips with one
    brand-tinted is a row where the tint competes with every other blue on the
    page. Solid near-black reads as "you are here" without claiming to be an
    action.
  */
  if (compact) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div
          className="flex min-w-0 items-center gap-[3px] overflow-x-auto"
          role="tablist"
          aria-label="Lead stage"
        >
          {CRM_LEAD_STAGES.map((entry) => {
            const current = entry === stage;
            return (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={current}
                disabled={disabled}
                onClick={() => {
                  if (entry !== stage) onChange(entry);
                }}
                className={cn(
                  "acct-stage-chip disabled:cursor-not-allowed disabled:opacity-60",
                  current
                    ? "bg-[var(--text-strong)] font-bold text-[var(--surface)]"
                    : "font-medium text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-body)]",
                )}
              >
                {CRM_STAGE_LABELS[entry]}
              </button>
            );
          })}
        </div>

        {next && !isClosed ? (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            disabled={disabled}
            onClick={() => onChange(next)}
            endIcon={<ArrowRight className="size-3.5" aria-hidden="true" />}
          >
            Move to {CRM_STAGE_LABELS[next]}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              className={cn(
                "-mx-1.5 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-base font-semibold hover:bg-[var(--surface-subtle)] disabled:cursor-not-allowed disabled:opacity-60",
                isWon && "text-[var(--status-success-text)]",
                isLost && "text-[var(--text-muted)]",
                !isClosed && "text-[var(--text-strong)]",
              )}
            >
              {CRM_STAGE_LABELS[stage]}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            collisionPadding={12}
            className="w-[min(15rem,calc(100vw-2rem))] p-1"
          >
            {CRM_LEAD_STAGES.map((entry) => (
              <button
                key={entry}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (entry !== stage) onChange(entry);
                }}
                className={cn(
                  "flex min-h-9 w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 text-left text-sm hover:bg-[var(--surface-hover)]",
                  entry === stage && "font-medium",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{CRM_STAGE_LABELS[entry]}</span>
                {entry === stage ? (
                  <Check className="size-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
                ) : null}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* One verb. From any stage on the path there is exactly one obvious
            next stage, and offering it as a button is what turns a display
            into something somebody can act on without thinking. */}
        {next && !isClosed ? (
          <Button
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange(next)}
            endIcon={<ArrowRight className="size-4" aria-hidden="true" />}
          >
            Move to {CRM_STAGE_LABELS[next]}
          </Button>
        ) : null}
      </div>

      {/* Read, not pressed: a 4px track that says how far along this is at a
          glance. Segments rather than one bar so the number of steps is
          legible without counting labels. */}
      <div
        className="flex gap-1"
        role="img"
        aria-label={
          isClosed
            ? `Stage: ${CRM_STAGE_LABELS[stage]}`
            : `Stage ${currentIndex + 1} of ${PATH_STAGES.length}: ${CRM_STAGE_LABELS[stage]}`
        }
      >
        {PATH_STAGES.map((entry, index) => (
          <span
            key={entry}
            className={cn(
              "h-1 flex-1 rounded-full",
              isWon || (!isLost && index <= currentIndex)
                ? fillClass
                : isLost && index <= currentIndex
                  ? fillClass
                  : "bg-[var(--surface-sunken)]",
            )}
          />
        ))}
      </div>

      {/* "Step 1 of 6" is gone: the six segments directly above already say
          it, and the band was stating the same stage three ways — the heading,
          the track, and a sentence counting the track. Screen readers still
          get the count, from the track's own label. What is left here is the
          one case the track cannot show: a lost lead is not at a step, and
          somebody looking at a drained track needs telling how to reopen it. */}
      {/* Kept on the phone, where there is room under the track; the band
          drops it, since a lost lead already shows a Lost status chip beside
          this control. */}
      {isLost ? (
        <p className="text-sm text-[var(--text-muted)]">
          Lost — reopen it from the stage menu
        </p>
      ) : null}
    </div>
  );
}
