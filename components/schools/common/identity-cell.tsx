"use client";

import type { ReactNode } from "react";

import { EntityLink } from "@/components/records/entity-link";
import { RecordMark, type RecordKind } from "@/components/records/record-mark";
import { RecordTableName } from "@/components/records/record-table";
import { cn } from "@/lib/utils";

/**
 * A pupil, a guardian, a teacher or a class, as one cell.
 *
 * Every campus list drew its own first column — `flex items-center gap-2` here,
 * `gap-3` there, a `font-medium` name on one screen and a plain one on the
 * next, a subtitle at the same size as the name on a third. Eighteen screens,
 * eighteen slightly different answers to a question that has one.
 *
 * So the mark, the name and the supporting line are composed here, from the
 * same `RecordTableName` and `RecordMark` the CRM registers use. A pupil looks
 * like a pupil whether you meet them on the roll, on a mark sheet or in the
 * arrears report, and a change to how a person reads lands on all of them.
 *
 * ## The supporting line
 *
 * It is what tells two rows apart, so it is never blank. `reference` leads
 * because it is the half that is unique — admission number, guardian number,
 * employee code — and `context` follows because it is what tells two Tendai
 * Moyos apart. A name with a job title as its whole subtitle leaves a hole
 * under every person who has no job title, and a row with a hole in it reads
 * as a row that failed to load.
 *
 * Mono, and a step down: the reference is read character by character, and at
 * the name's size and face it read as a second name and doubled the apparent
 * height of every row.
 *
 * ## The link
 *
 * `EntityLink`, so a reference behaves the same here as it does in CRM: a
 * standing underline rather than a hover-only one — a cue that arrives with
 * the pointer is not a cue — and a plain click opens the record beside the
 * page rather than travelling to it.
 *
 * The anchor drops the underline `EntityLink` would otherwise paint on the
 * whole cell. A text decoration is painted by the element that declares it and
 * cannot be switched off by a descendant, so an underline out here struck
 * through the admission number under every name; `RecordTableName` underlines
 * the title itself instead.
 */
export function PersonCell({
  name,
  firstName,
  lastName,
  href,
  reference,
  context,
  photoUrl,
  kind = "student",
  size = "sm",
  className,
}: {
  /** Use where the person arrives as one string — a staff `User.name`. */
  name?: string;
  firstName?: string;
  lastName?: string;
  /** Their record. Omitted where the row does not open — a portal, a dialog. */
  href?: string | null;
  /**
   * The identifier that always exists: an admission number, a guardian
   * number, an employee code. It leads the supporting line.
   */
  reference?: ReactNode;
  /** The word of context after it — a year group, a job title, a hostel. */
  context?: ReactNode;
  photoUrl?: string | null;
  /** Which register they are in. Decides the mark's glyph and its hue. */
  kind?: Extract<RecordKind, "student" | "guardian" | "teacher" | "person">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const full = name ?? [firstName, lastName].filter(Boolean).join(" ");
  const cell = (
    <RecordTableName
      leading={<RecordMark kind={kind} name={full} avatarUrl={photoUrl} size={size} />}
      title={full}
      subtitle={supportingLine(reference, context)}
    />
  );

  if (!href) {
    return <span className={cn("block min-w-0", className)}>{cell}</span>;
  }

  return (
    // `group/row` so the title's underline darkens when the cell is hovered.
    // The CRM tables publish it from the `<tr>`; a campus `DataTable` row does
    // not, and without it the cue never responds to the pointer at all.
    <EntityLink
      href={href}
      className={cn("group/row block min-w-0 no-underline hover:no-underline", className)}
    >
      {cell}
    </EntityLink>
  );
}

/**
 * The same cell for the things a school is made of — a class, a subject, a
 * hostel, a year group.
 *
 * Split from `PersonCell` only by what the mark is: a person gets initials,
 * because the reader is looking for a *who* and a repeated person glyph tells
 * them nothing, and everything else gets its entity tile.
 */
export function RecordNameCell({
  name,
  href,
  reference,
  context,
  kind,
  size = "sm",
  className,
}: {
  name: string;
  href?: string | null;
  /** The code that always exists — a subject code, a class code. */
  reference?: ReactNode;
  context?: ReactNode;
  kind: RecordKind;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const cell = (
    <RecordTableName
      leading={<RecordMark kind={kind} name={name} size={size} />}
      title={name}
      subtitle={supportingLine(reference, context)}
    />
  );

  if (!href) {
    return <span className={cn("block min-w-0", className)}>{cell}</span>;
  }

  return (
    <EntityLink
      href={href}
      className={cn("group/row block min-w-0 no-underline hover:no-underline", className)}
    >
      {cell}
    </EntityLink>
  );
}

/**
 * `reference · context`, with nothing rendered when both are absent.
 *
 * Composed rather than concatenated so a missing context cannot leave a
 * trailing separator, and so the whole line disappears rather than becoming a
 * blank one.
 */
function supportingLine(reference: ReactNode, context: ReactNode): ReactNode {
  const parts = [reference, context].filter(
    (part) => part !== null && part !== undefined && part !== "" && part !== false,
  );
  if (parts.length === 0) return undefined;
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {index > 0 ? <span className="px-1 text-[var(--text-faint)]">·</span> : null}
          {part}
        </span>
      ))}
    </>
  );
}
