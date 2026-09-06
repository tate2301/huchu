"use client";

import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@corelithzw/react";

import { RecordMark } from "@/components/records/record-mark";
import {
  RecordCell,
  RecordTableName,
  type RecordCellKind,
} from "@/components/records/record-table";
import { cn } from "@corelithzw/ui/lib/utils";

/**
 * The parts of a people directory that HR and CRM owe each other.
 *
 * The user put it plainly: "I know the people list was made for HR, but we use
 * the same design in CRM". `People.dc.html` is one artboard, and the two lists
 * differ only in the columns they carry — HR wants a national ID and a grade,
 * CRM wants a company and a deal count. Everything either side of the column
 * set is the same drawing, so from here it is the same code: how a person is
 * named in a row, what a cell says when it has nothing to say, and what colour
 * an employment type is.
 *
 * It sits in `components/records` rather than under either module because the
 * moment it lives in one of them the other becomes the copy that drifts —
 * which is exactly how the two lists got here.
 */

/**
 * How a person is named in a row: their mark, their name, and the one line
 * that tells two people of the same name apart.
 *
 * The canvas tints the avatar chip from five pairs cycled by row index.
 * `RecordMark` derives its hue from the name instead, which is the same chip
 * with one difference that matters off an artboard: an artboard has one page,
 * and a real directory is paged, filtered and searched. Cycling by index would
 * repaint somebody the moment a row above them was filtered out, so the colour
 * would stop being a thing you could recognise a person by — which is its only
 * job.
 */
export function DirectoryName({
  name,
  photoUrl,
  subtitle,
}: {
  name: string;
  /** A passport photo or an uploaded picture. Beats the initials. */
  photoUrl?: string | null;
  /** The mono line under the name — a reference, and a word of context. */
  subtitle?: ReactNode;
}) {
  return (
    <RecordTableName
      leading={<RecordMark kind="person" name={name} avatarUrl={photoUrl} size="sm" />}
      title={name}
      subtitle={subtitle}
    />
  );
}

/**
 * A value in a directory row, and an honest sentence where there is no value.
 *
 * `RecordCell` already draws each kind the way the canvas decides it —
 * per value, not per column — and falls back to an em-dash when there is
 * nothing. A dash is right in a table of figures and wrong in a directory: the
 * artboard writes "not on file" under National ID and "No linked user" under
 * Access, because those two blanks mean different things and both of them are
 * facts somebody may need to act on. A dash says only "we have nothing", which
 * is the one reading that is never useful here.
 *
 * So `missing` is required. A caller that cannot name what is absent has not
 * finished thinking about the column.
 */
export function DirectoryCell({
  kind,
  value,
  href,
  missing,
  className,
}: {
  kind?: RecordCellKind;
  value: ReactNode;
  /** Where a `relation` points. Ignored by every other kind. */
  href?: string | null;
  /** What the cell says when there is nothing — "not on file", "No grade". */
  missing: string;
  className?: string;
}) {
  const empty = value === null || value === undefined || value === "" || value === false;

  if (empty) {
    return (
      <span className={cn("block truncate text-[var(--text-faint)]", className)}>{missing}</span>
    );
  }

  return <RecordCell kind={kind} value={value} href={href} className={className} />;
}

/**
 * A second fact riding along beside the first — the modules an account reaches,
 * the date somebody started.
 *
 * The artboard keeps every directory row to one line, so a fact that used to
 * sit on a second line either goes here or goes into a column of its own. Faint
 * and mono, so it reads as an aside to the value rather than as a rival to it.
 */
export function DirectoryNote({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 font-mono text-xs text-[var(--text-faint)]">{children}</span>
  );
}

/** A cell that carries a value and an aside on the one line. */
export function DirectoryLine({ children }: { children: ReactNode }) {
  return <span className="flex min-w-0 items-center gap-1.5">{children}</span>;
}

export const EMPLOYMENT_TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  CASUAL: "Casual",
};

/**
 * What colour an employment type is.
 *
 * `lib/crm/tones.ts` draws the line at states get colour, categories do not —
 * and on that reading this looks like a category. It is not one. How somebody
 * is engaged decides whether they accrue leave, whether their pay is on the
 * monthly run, and whether a manager can put them on next week's roster at
 * all; a casual and a full-timer are two different standings, not two flavours
 * of the same one. The canvas colours the column for that reason, and these
 * are its four pairs.
 */
export const EMPLOYMENT_TYPE_TONE: Record<string, BadgeTone> = {
  FULL_TIME: "success",
  PART_TIME: "info",
  CONTRACT: "warn",
  CASUAL: "neutral",
};

export function EmploymentBadge({ type }: { type?: string | null }) {
  if (!type) {
    return <span className="text-[var(--text-faint)]">not set</span>;
  }

  return (
    <Badge tone={EMPLOYMENT_TYPE_TONE[type] ?? "neutral"} size="sm">
      {EMPLOYMENT_TYPE_LABEL[type] ?? type}
    </Badge>
  );
}
