"use client";

import type { ReactNode } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatusChip } from "@/components/ui/status-chip";
import { ChevronDown } from "@/lib/icons";
import type { CanonicalUiStatus } from "@/lib/ui/status-map";

/**
 * The strip under the app bar on a record page: the things you do to the
 * record, as controls — not a second heading.
 *
 * The app bar already names the record (with its reference), so nothing here
 * repeats a name. What sits here is the record's lifecycle and the controls a
 * page adds beside it, left to right, and the record's headline figure pushed
 * to the far end — the same place a list's toolbar keeps its count.
 *
 * The lifecycle is a button showing where the record is. A page that can move
 * it (a lead's stepper, a deal's stage bar, a job's stage rail) hands the
 * control over as `stage`, and it opens in a popover from that button: it is
 * a choice you make now and then, not a band that should take a row of its
 * own the rest of the time. A page that only reports a status gets the chip.
 *
 * Hidden below `md`, where the record's landing view carries the same status
 * and controls at its head.
 */
export function RecordToolbar({
  status,
  stage,
  figure,
  children,
}: {
  status?: { label: string; status: CanonicalUiStatus } | null;
  /** The control that moves the record along its lifecycle. */
  stage?: ReactNode;
  /** The record's headline figure — a deal's value, a line's amount. */
  figure?: ReactNode;
  /** The page's own controls, after the lifecycle. */
  children?: ReactNode;
}) {
  if (!status && !stage && !figure && !children) return null;

  return (
    <div
      role="toolbar"
      aria-label="Record"
      className="hidden min-h-[var(--list-toolbar-h)] shrink-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface-base)] px-[var(--content-gutter-x)] md:flex"
    >
      {stage ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={status ? `Stage: ${status.label}. Change it` : "Change the stage"}
              className="flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-sm hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {status ? (
                <StatusChip status={status.status} label={status.label} />
              ) : (
                <span className="text-[var(--text-body)]">Stage</span>
              )}
              <ChevronDown aria-hidden="true" className="size-3.5 text-[var(--text-muted)]" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto max-w-[min(44rem,calc(100vw-2rem))] p-3">
            {stage}
          </PopoverContent>
        </Popover>
      ) : status ? (
        <span className="px-1.5">
          <StatusChip status={status.status} label={status.label} />
        </span>
      ) : null}

      {children ? <div className="flex min-w-0 items-center gap-1.5">{children}</div> : null}

      {figure ? (
        <span className="ml-auto shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-strong)]">
          {figure}
        </span>
      ) : null}
    </div>
  );
}
