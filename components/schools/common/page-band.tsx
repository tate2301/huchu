"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * The state strip under a campus page's title.
 *
 * The heading law the design settled on: a page is named once, in the header.
 * The band under it carries STATE — the term in view, how many are in, how much
 * is owed — not a second copy of the name, and not a caption explaining a word
 * nobody misread. Every chip here is a number that changes; anything that never
 * changes belongs in the heading or nowhere.
 *
 * It is sticky because the numbers are the reason the page is open, and a
 * register board scrolled past its own count is a screen you scroll back up.
 *
 * Its height is `--page-band-h` rather than whatever its contents come to, for
 * the same reason the CRM band states one: it is the first band in the sticky
 * stack, and `SchoolsPage` publishes that height as the offset everything
 * below it pins to. A band that is 38px on one screen and 46px on the next
 * puts every table header in the module in a slightly different place.
 *
 * What does NOT go here: the row count. "50 of 214" is not state — it is the
 * answer to whatever the filters just asked, so it moves when they move and it
 * belongs beside them, in `TableControls`.
 */

export type BandChipTone = "neutral" | "brand" | "success" | "warn" | "danger";

export type BandChip = {
  /** What the number is: "Registers in", "Owing". */
  label: string;
  /** The number itself. Rendered tabular so a changing value does not jitter. */
  value: ReactNode;
  tone?: BandChipTone;
  /** Makes the whole chip a link to the screen that explains it. */
  href?: string;
};

const TONE_CLASS: Record<BandChipTone, string> = {
  neutral: "border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-body)]",
  brand: "border-transparent bg-[color:var(--brand-soft)] text-[color:var(--brand-strong)]",
  success: "border-transparent bg-[color:var(--tone-success-soft)] text-[color:var(--tone-success)]",
  warn: "border-transparent bg-[color:var(--tone-warn-soft)] text-[color:var(--tone-warn)]",
  danger: "border-transparent bg-[color:var(--tone-danger-soft)] text-[color:var(--tone-danger)]",
};

export function PageBand({
  chips,
  actions,
  className,
}: {
  chips: BandChip[];
  /** Screen-level verbs — export, a date step. The primary action stays in the header. */
  actions?: ReactNode;
  className?: string;
}) {
  if (chips.length === 0 && !actions) return null;

  return (
    <div
      className={cn(
        // z-30, above the options row's z-20: the toolbar pins to the offset
        // this band publishes, and the two overlap for the frame it takes the
        // browser to settle a scroll.
        "sticky top-0 z-30 -mx-1 mb-1 flex min-h-[var(--page-band-h)] flex-wrap items-center gap-2 border-b border-[color:var(--border)] bg-[color:var(--surface-muted)] px-1 py-2",
        className,
      )}
    >
      {chips.map((chip) => {
        const body = (
          <>
            <span className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              {chip.label}
            </span>
            <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums">
              {chip.value}
            </span>
          </>
        );
        const chipClass = cn(
          "flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1",
          TONE_CLASS[chip.tone ?? "neutral"],
        );
        // `next/link`, not a bare anchor: these point at other campus screens,
        // and a full document load to read a number is the page you were
        // reading thrown away.
        return chip.href ? (
          <Link key={chip.label} href={chip.href} className={cn(chipClass, "hover:underline")}>
            {body}
          </Link>
        ) : (
          <div key={chip.label} className={chipClass}>
            {body}
          </div>
        );
      })}
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
