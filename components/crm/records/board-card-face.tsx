"use client";

import type { ComponentType, ReactNode } from "react";

import { RecordMark } from "@/components/records/record-mark";
import { cn } from "@/lib/utils";

/**
 * What a card on a board says, in the order it is read.
 *
 * Every board draws its cards through this, so a lead, a deal and a person
 * put their name, their reference, their figure and their owner in the same
 * places. Someone scanning a board is comparing cards; that only works when
 * the same fact sits in the same spot on each.
 *
 *   title                         the record's name
 *   subtitle                      reference · who it is for
 *   figure ................ owner the number, and whose it is
 *   signals                       time in stage, an overdue task
 */
export function BoardCardFace({
  leading,
  title,
  subtitle,
  figure,
  owner,
  children,
}: {
  /** A mark before the title — the record's emoji or avatar. */
  leading?: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** The card's one number, set in mono. */
  figure?: ReactNode;
  /** The owner's name, drawn as their avatar. `null` means unassigned. */
  owner?: string | null;
  /** Signals under the figure — `BoardCardSignal`s, usually. */
  children?: ReactNode;
}) {
  // A rep is a person, so the same avatar they get everywhere else.
  const avatar =
    owner !== undefined ? (
      <RecordMark kind="rep" name={owner ?? "Unassigned"} size="sm" className="shrink-0" />
    ) : null;
  // With no figure to sit beside, the owner moves up beside the name rather
  // than taking a row of its own.
  const hasFigure = figure !== undefined;

  return (
    <div className="space-y-2.5">
      <div className="flex items-start gap-2.5">
        {leading ? <span className="flex-none">{leading}</span> : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-strong)]">{title}</p>
          {subtitle ? (
            <p className="truncate text-sm text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
        </div>
        {hasFigure ? null : avatar}
      </div>

      {hasFigure ? (
        <div className="flex min-h-6 items-center justify-between gap-2">
          <span className="truncate font-mono text-sm tabular-nums text-[var(--text-strong)]">
            {figure}
          </span>
          {avatar}
        </div>
      ) : null}

      {children}
    </div>
  );
}

const SIGNAL_TONE = {
  neutral: "text-[var(--text-subtle)]",
  warn: "font-medium text-[var(--status-warning-text)]",
  danger: "font-medium text-[var(--status-error-text)]",
} as const;

/**
 * One line of state on a card: an icon and words. Never colour alone — the
 * old overdue marker was a red dot with its meaning in a tooltip, which
 * nobody hovering a board to drag it was ever going to read.
 */
export function BoardCardSignal({
  icon: Icon,
  tone = "neutral",
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  tone?: keyof typeof SIGNAL_TONE;
  children: ReactNode;
}) {
  return (
    <p className={cn("flex items-center gap-1.5 text-sm", SIGNAL_TONE[tone])}>
      <Icon className="size-3.5 flex-none" />
      <span className="min-w-0 truncate">{children}</span>
    </p>
  );
}
