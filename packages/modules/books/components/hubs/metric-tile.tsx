"use client";

import Link from "next/link";

import type { LucideIcon } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * A figure, and the two things that make it a fact.
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 *
 * This used to hand off to `FrappeStatCard`, which renders frappe-ui's
 * `NumberChart`. Three things were wrong with that, and the first is the one
 * that mattered:
 *
 *  - `detail` was accepted here, passed down, and **never rendered**.
 *    `FrappeStatCard` takes the prop and drops it on the floor. Every hub page
 *    was writing a qualifier for every tile — "Outstanding receivables",
 *    "Balance sheet equity", "9 issued invoices" — and none of it reached the
 *    screen. A KPI page of bare numbers with no idea what period, what
 *    denominator or what direction.
 *  - there was no way to pass a delta at all. `FrappeStatCard` supports one;
 *    this component did not expose it, so it was always undefined.
 *  - the chrome was a 6px corner on a half-opacity border, with tone fills
 *    taken from raw Tailwind palette steps (`bg-emerald-50/80`) — a different
 *    card from every other panel in accounting, and a palette that does not
 *    move when the design tokens do.
 *
 * ── What it is now ─────────────────────────────────────────────────────────
 *
 * The tile as the artboards draw it. A tone dot, the label, the figure, then a
 * delta and a note. `value` still comes in as a number because tone is derived
 * from its sign; `valueLabel` is what actually prints, so the caller keeps
 * control of formatting.
 */

export type MetricTone = "neutral" | "good" | "warn" | "danger";

const TONE_DOT: Record<MetricTone, string> = {
  neutral: "var(--brand)",
  good: "var(--tone-success)",
  warn: "var(--tone-warn)",
  danger: "var(--tone-danger)",
};

/**
 * Ink for the delta, and for the figure when it is bad news.
 *
 * These are the badge inks rather than the `--tone-*` ramp: at 10.5px the
 * mid-ramp colours are too light to read on white, and the tile has to agree
 * with the badges sitting in the table below it.
 */
const TONE_INK: Record<MetricTone, string> = {
  neutral: "var(--text-muted)",
  good: "var(--badge-ok-fg)",
  warn: "var(--badge-warn-fg)",
  danger: "var(--badge-bad-fg)",
};

type MetricTileProps = {
  title: string;
  /** The raw figure. Used for the sign-derived tone, not for display. */
  value: number;
  /** What prints. The caller formats, because currency and counts differ. */
  valueLabel: string;
  /**
   * The figure that qualifies this one — "9 invoices", "+18%", "3 unposted".
   * Set in the tone's ink, so it carries the direction without a chevron.
   */
  delta?: string;
  /** What the delta is measured against — "vs July", "across 6 customers". */
  detail?: string;
  /**
   * Overrides the sign-derived tone. Pass this when the number's meaning is
   * not its sign — a liability of zero is good news, a count of unposted
   * journals is bad news at any size.
   */
  tone?: MetricTone;
  /**
   * The delta's own tone, when it disagrees with the figure's.
   *
   * The artboards decouple these more often than not: Expenses carries a
   * neutral mark — spending is not in itself good or bad news — over an amber
   * delta, because the *direction* is the part worth watching. Driven from one
   * tone the mark had to turn amber with it, and a row of six tiles came out
   * as a row of warnings.
   *
   * Falls back to the figure's tone, which is what every tile that does agree
   * already gets.
   */
  deltaTone?: MetricTone;
  /**
   * For figures where down is the good direction — liabilities, overdue
   * balances, a trial-balance difference. Only consulted when `tone` is not
   * given.
   */
  negativeIsBetter?: boolean;
  /** Makes the whole tile the target. The design's tiles are all links. */
  href?: string;
  /**
   * An icon in place of the tone dot.
   *
   * The accounting artboards mark each tile with a 7px square in the tone
   * colour; the CRM overview uses a glyph instead. Both are the same slot
   * doing the same job — a colour-coded mark that identifies the tile before
   * you have read its label — so this is one component with two marks rather
   * than two tiles. Absent, the dot renders.
   */
  icon?: LucideIcon;
};

export function MetricTile({
  title,
  value,
  valueLabel,
  delta,
  detail,
  tone,
  deltaTone,
  negativeIsBetter = false,
  href,
  icon: Icon,
}: MetricTileProps) {
  /*
    Sign-derived tone is the fallback, not the rule.

    Zero is deliberately neutral in both directions: a balance of nothing is
    not an achievement and not a problem, and colouring it green on a page of
    empty tiles makes an unconfigured tenant look like a healthy one.
  */
  const resolved: MetricTone =
    tone ??
    (value === 0
      ? "neutral"
      : negativeIsBetter
        ? value > 0
          ? "warn"
          : "good"
        : value > 0
          ? "good"
          : "danger");

  // The delta follows the figure unless the caller has separated them.
  const deltaInk: MetricTone = deltaTone ?? resolved;

  const body = (
    <>
      <div className="mb-1.5 flex items-center gap-1.5">
        {Icon ? (
          // The glyph takes the tone colour, the same colour the dot would
          // have taken — the mark is the tone, whichever shape it is.
          <span className="shrink-0" style={{ color: TONE_DOT[resolved] }}>
            <Icon className="size-3.5" aria-hidden />
          </span>
        ) : (
          <span
            aria-hidden="true"
            className="acct-stat-dot"
            style={{ background: TONE_DOT[resolved] }}
          />
        )}
        <span className="acct-stat-label min-w-0 truncate">{title}</span>
      </div>
      <div
        className="acct-stat-value font-mono tabular-nums"
        style={{
          color: resolved === "danger" ? "var(--badge-bad-fg)" : "var(--text-strong)",
        }}
      >
        {valueLabel}
      </div>
      {delta || detail ? (
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
          {delta ? (
            <span className="acct-stat-delta shrink-0" style={{ color: TONE_INK[deltaInk] }}>
              {delta}
            </span>
          ) : null}
          {detail ? <span className="acct-stat-note min-w-0 truncate">{detail}</span> : null}
        </div>
      ) : null}
    </>
  );

  const shell = cn(
    "acct-stat block rounded-[10px] border border-[var(--border)] bg-[var(--surface)]",
    href && "transition-colors hover:border-[var(--border-strong)]",
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
