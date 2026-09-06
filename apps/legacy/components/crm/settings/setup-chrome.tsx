"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@corelithzw/ui/components/card";
import type { LucideIcon } from "@corelithzw/ui/lib/icons";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The three shapes every CRM setup section is drawn from.
 *
 * The artboards use the same panel, the same footnote and the same figure card
 * across all six sections. Sharing them is what stops Pipelines and Lead
 * sources growing two slightly different 36px heads, and it is what keeps the
 * counts, hints and notes one weight below the data rather than competing
 * with it.
 */

/**
 * A titled panel — the artboards' 36px head, a hairline, then the content.
 *
 * `hint` is the quiet line the head carries on its right: "drag to reorder",
 * "the channel is what Insights counts", "a revoked key stops working
 * immediately". It is not a description of the heading — it is the one thing
 * about the *table* a reader cannot infer from its columns, which is why the
 * artboards put it in the head rather than in a paragraph above the panel.
 */
export function SetupPanel({
  title,
  hint,
  count,
  flush = false,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  /** Right-aligned tally, mono. For a head with no hint to carry. */
  count?: ReactNode;
  /** Drop the body padding — a panel whose content is a table draws its own. */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {hint ? (
          <span className="acct-caption ml-auto hidden truncate md:inline">{hint}</span>
        ) : null}
        {count !== undefined ? (
          <span className="acct-rail-sub ml-auto shrink-0">{count}</span>
        ) : null}
      </CardHeader>
      {flush ? children : <CardContent>{children}</CardContent>}
    </Card>
  );
}

/**
 * The footnote under a setup table.
 *
 * Each of these earns its place by stating a rule the interface enforces but
 * cannot show — that Won and Lost cannot be removed, that a key is displayed
 * once, that attribution still works with no sources defined at all. A note
 * that merely restated the panel above it would be the kind of explanation
 * this pass exists to delete.
 *
 * The mark is a step lighter than the prose beside it: on a neutral panel an
 * icon at text weight reads as the loudest thing in the block, which is
 * backwards for a footnote.
 */
export function SetupNote({
  icon,
  tone = "mute",
  children,
}: {
  icon: LucideIcon;
  /** `info` for a rule worth noticing; `mute` for one worth knowing. */
  tone?: "mute" | "info";
  children: ReactNode;
}) {
  const Mark = icon;
  const info = tone === "info";
  return (
    <div
      className={cn(
        "mt-2.5 flex items-start gap-2.5 rounded-[var(--card-radius)] border px-3 py-2.5",
        info
          ? "border-[var(--brand-100)] bg-[var(--brand-soft)]"
          : "border-[var(--border)] bg-[var(--surface-base)]",
      )}
    >
      <Mark
        aria-hidden="true"
        className={cn(
          "mt-px size-4 shrink-0",
          info ? "text-[var(--brand)]" : "text-[var(--text-subtle)]",
        )}
      />
      <p
        className={cn(
          "text-pretty text-sm leading-relaxed",
          info ? "text-[var(--brand-strong)]" : "text-[var(--text-muted)]",
        )}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * A figure card — the strip of channel totals above the sources table.
 *
 * The figure is mono and large, the label small above it, the note small
 * below. Pressable where `onSelect` is given, because on Lead sources these
 * are also the filter: pressing "Paid ads" is how you see only the paid-ads
 * sources. A total you cannot act on is a total that has to be read twice.
 */
export function SetupStat({
  label,
  dot,
  value,
  note,
  active = false,
  onSelect,
}: {
  label: string;
  /** A background class from the tone maps — `bg-[var(--brand)]`. */
  dot?: string;
  value: ReactNode;
  note?: ReactNode;
  active?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5">
        {dot ? <span className={cn("size-[7px] shrink-0 rounded-[2px]", dot)} /> : null}
        <span className="truncate text-sm font-semibold text-[var(--text-muted)]">{label}</span>
      </span>
      <span className="mt-1 block font-mono text-xl font-bold leading-tight tracking-tight tabular-nums text-[var(--text-strong)]">
        {value}
      </span>
      {note ? <span className="acct-caption mt-0.5 block truncate">{note}</span> : null}
    </>
  );

  const shell = cn(
    "block min-w-0 rounded-[var(--card-radius)] border px-3 py-2.5 text-left",
    active
      ? "border-[var(--action-primary-bg)] bg-[var(--surface-base)]"
      : "border-[var(--border)] bg-[var(--canvas)]",
  );

  if (!onSelect) return <div className={shell}>{body}</div>;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(shell, "hover:bg-[var(--surface-base)]")}
    >
      {body}
    </button>
  );
}
