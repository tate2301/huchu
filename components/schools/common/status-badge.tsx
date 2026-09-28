"use client";

import type { ReactNode } from "react";
import { Badge as BaseBadge, type BadgeProps, type BadgeTone } from "@corelithzw/react";

import { CheckCircle, Info, Warning, XCircle } from "@/lib/icons";

/**
 * A badge that says what it means without relying on its colour.
 *
 * ## Why this exists
 *
 * `docs/design-system/05-rules.md`: *"Never signal state by colour alone.
 * Colour + icon + text label, always."* 225 status badges across the school
 * module were colour + text, which fails that rule for roughly one man in
 * twelve — red/green is the common confusion, and `success` and `danger` were
 * the two most used tones in the module.
 *
 * ## Why it is a wrapper and not 149 edits
 *
 * The tone IS the state. `BadgeTone` is a closed union, so one map from tone
 * to mark covers every call site, and a screen cannot disagree with another
 * about what "danger" looks like. Call sites change their import, not their
 * JSX.
 *
 * ## Only four tones get a mark
 *
 * | Tone | Mark | Why |
 * |---|---|---|
 * | `success` | check circle | it worked, it arrived, it is settled |
 * | `warn` | warning | part done, or decided but not acted on |
 * | `danger` | x circle | it failed, it was refused, the money is not coming |
 * | `info` | info | worth knowing, nothing to do |
 * | `neutral` `outline` `brand` | **none** | not states |
 *
 * That last row is the whole judgement. "Default", "On lists", "Form 4" are
 * *labels*, not states — the rule is about state, and marking a category tells
 * the reader nothing they cannot already read. It also protects the four that
 * do mean something: if every badge carries a mark, no mark carries weight.
 *
 * `accent` is untouched for the same reason. It exists for categorical hues
 * and takes precedence over `tone`, so an accented badge is by definition not
 * a status.
 */

const TONE_MARK: Partial<Record<BadgeTone, typeof CheckCircle>> = {
  success: CheckCircle,
  warn: Warning,
  danger: XCircle,
  info: Info,
};

export function Badge({ tone, accent, dot, children, ...rest }: BadgeProps) {
  // An accented badge is categorical by construction — `accent` takes
  // precedence over `tone` in the design system, so there is no state here to
  // mark.
  const Mark = accent ? undefined : tone ? TONE_MARK[tone] : undefined;

  if (!Mark) {
    return (
      <BaseBadge tone={tone} accent={accent} dot={dot} {...rest}>
        {children}
      </BaseBadge>
    );
  }

  return (
    // `dot` is dropped when a mark is drawn. The dot is the same colour saying
    // the same thing a second time, and two leading ornaments on a 20px chip
    // is a chip with no room left for its word.
    <BaseBadge tone={tone} {...rest}>
      <Mark className="size-3 shrink-0" aria-hidden="true" />
      {children}
    </BaseBadge>
  );
}

export type { BadgeProps, BadgeTone };

/**
 * The mark alone, for the rare place that needs a status glyph outside a
 * badge — a table cell too narrow for a chip, say. Returns null for the tones
 * that carry no mark, so it is safe to drop into a layout unconditionally.
 */
export function StatusMark({ tone, className = "size-3.5" }: { tone: BadgeTone; className?: string }) {
  const Mark = TONE_MARK[tone];
  return Mark ? <Mark className={className} aria-hidden="true" /> : null;
}

/** Re-exported so a call site importing both does not need two import lines. */
export type StatusBadgeChildren = ReactNode;
