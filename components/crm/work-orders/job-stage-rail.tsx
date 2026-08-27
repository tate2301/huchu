"use client";

import { WORK_ORDER_STATUS_LABELS } from "@/lib/crm/work-orders";
import { cn } from "@/lib/utils";

import type { JobStatus } from "./job-types";

/**
 * Where the job has got to, in the band, drawn the way a deal's stages are.
 *
 * The lifecycle is a state machine and not a free-text status, so this is the
 * one control that says so: five states named inline, the current one filled
 * in the ink rather than the brand — solid near-black reads as "you are here"
 * without competing with every other blue on the page — and only the moves the
 * server would actually accept live enough to press.
 *
 * Cancelled is off the path on purpose. It is an outcome rather than a step,
 * the same way Lost is on a deal, and there is no route that performs it, so
 * it is drawn only when the job has already been cancelled rather than offered
 * as somewhere to go.
 */
const PATH: JobStatus[] = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "BLOCKED", "COMPLETED"];

export function JobStageRail({
  status,
  allowed,
  onMove,
  disabled,
}: {
  status: JobStatus;
  /** What the server says can happen next — `allowedTransitions` off the record. */
  allowed: JobStatus[];
  onMove: (next: JobStatus) => void;
  disabled?: boolean;
}) {
  const rail = status === "CANCELLED" ? [...PATH, "CANCELLED" as JobStatus] : PATH;

  return (
    <div
      className="flex min-w-0 items-center gap-[3px] overflow-x-auto"
      role="tablist"
      aria-label="Job stage"
    >
      {rail.map((stage) => {
        const isCurrent = stage === status;
        // Draft is a marker, never a target. The state machine does allow a
        // scheduled job back to draft, but "un-book it" is not a step along
        // the path — the way to undo a booking is to move it or to cancel.
        const live = !isCurrent && stage !== "DRAFT" && allowed.includes(stage);

        return (
          <button
            key={stage}
            type="button"
            role="tab"
            aria-selected={isCurrent}
            disabled={disabled || !live}
            onClick={() => live && onMove(stage)}
            className={cn(
              "acct-stage-chip",
              isCurrent
                ? "bg-[var(--text-strong)] font-bold text-[var(--surface)]"
                : live
                  ? "font-medium text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-body)]"
                  : // Not a move that can be made from here. Faint rather than
                    // hidden: the shape of the lifecycle is the useful part,
                    // and a rail that loses a state each time you advance
                    // stops being a map.
                    "font-medium text-[var(--text-disabled)]",
              (disabled || !live) && !isCurrent && "cursor-default",
            )}
          >
            {WORK_ORDER_STATUS_LABELS[stage]}
          </button>
        );
      })}
    </div>
  );
}
