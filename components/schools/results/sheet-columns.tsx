"use client";

import type { ReactNode } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { RecordMark } from "@/components/records/record-mark";
import { RecordCell } from "@/components/records/record-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { RecordNameCell } from "@/components/schools/common/identity-cell";
import { RecordActions } from "@/components/schools/common/record-actions";
import type { ResultSheetLike } from "@/lib/schools/results-v2";
import {
  PublishStateBadge,
  SHEET_STATE_LABELS,
  SheetStateBadge,
  formatDay,
  waitingFor,
} from "@/components/schools/results/sheet-state";
import type { useResultSheetWorkflow } from "@/components/schools/results/use-sheet-workflow";

/**
 * What a result sheet looks like as a row, decided once.
 *
 * The overview, the sheets list, the moderation queue, the publishing screen
 * and a year group's own page are five arrangements of one table. Each had
 * grown its own column array, and they had drifted the way column arrays do:
 * the same sheet was `title` over `term / class / stream` on three of them and
 * a bare class name on a fourth, its average was to one decimal place here and
 * two there, and the row that opened a dialog on one screen was a dead end on
 * another. A reader crossing from the queue to publishing — which a head of
 * department does a dozen times an afternoon — had to re-read the row each
 * time.
 *
 * So the cells are composed here and the screens pick the ones their question
 * needs. Which columns a screen shows is still its own decision; what a cell
 * *says* is not.
 */

/** Where a sheet's row goes: the year group's marks, narrowed to its stream. */
export function sheetHref(sheet: ResultSheetLike) {
  return `/schools/results/class/${sheet.class.id}${sheet.stream ? `?streamId=${sheet.stream.id}` : ""}`;
}

/** "Form 2 Alpha" — the class and the set inside it, as one phrase. */
export function sheetClassName(sheet: ResultSheetLike) {
  return [sheet.class.name, sheet.stream?.name].filter(Boolean).join(" ");
}

function linesOf(sheet: ResultSheetLike) {
  return sheet.stats?.linesCount ?? sheet._count.lines;
}

/**
 * The sheet, as an identity cell.
 *
 * The class leads the supporting line because it is the half that is unique —
 * "Mathematics — end of term" is the title of one sheet per year group — and
 * the term follows, because that is what tells this term's Form 2 Mathematics
 * from last term's. Both on one mono line rather than in columns of their own:
 * a Class column and a Term column beside a Sheet column spend 220px of a
 * register saying what the cell already says.
 */
export function SheetCell({ sheet }: { sheet: ResultSheetLike }) {
  return (
    <RecordNameCell
      kind="document"
      name={sheet.title}
      href={sheetHref(sheet)}
      reference={sheetClassName(sheet)}
      context={sheet.term.name}
    />
  );
}

export function sheetColumn(): ColumnDef<ResultSheetLike> {
  return {
    id: "sheet",
    header: "Sheet",
    cell: ({ row }) => <SheetCell sheet={row.original} />,
  };
}

/**
 * How long the sheet has been somebody else's problem.
 *
 * A queue's first column is age: "submitted 21 Aug" makes the reader do the
 * arithmetic and "9 days" does not, so the figure leads and the date it is
 * counted from sits under it.
 */
export function waitingColumn(
  since: (sheet: ResultSheetLike) => string | null | undefined,
  /** One clock for the whole table — see `waitingFor`. */
  now: number,
): ColumnDef<ResultSheetLike> {
  return {
    id: "waiting",
    header: "Waiting",
    cell: ({ row }) => (
      <span className="block">
        <NumericCell align="left">{waitingFor(since(row.original), now)}</NumericCell>
        <span className="mt-0.5 block font-mono text-sm text-[color:var(--text-subtle)]">
          since {formatDay(since(row.original))}
        </span>
      </span>
    ),
  };
}

/**
 * How much has been marked.
 *
 * `NumericCell` rather than `RecordCell`: both carry the mono tabular face a
 * figure wants, and only this one hangs the digits off the right edge — which
 * is the whole reason a count is in a column rather than in a sentence.
 */
export function linesColumn(header = "Marks"): ColumnDef<ResultSheetLike> {
  return {
    id: "lines",
    header,
    cell: ({ row }) => <NumericCell>{linesOf(row.original)}</NumericCell>,
  };
}

/**
 * One decimal place, everywhere.
 *
 * The queue and the publishing screen printed two and the overview printed
 * one, for the same average of the same marks. A mark out of a hundred does
 * not carry a second decimal of meaning, and two screens disagreeing about
 * how precise a figure is makes a reader wonder which one is rounding.
 */
export function averageColumn(): ColumnDef<ResultSheetLike> {
  return {
    id: "average",
    header: "Mean",
    cell: ({ row }) => {
      const average = row.original.stats?.averageScore ?? null;
      return <NumericCell>{average === null ? "—" : average.toFixed(1)}</NumericCell>;
    },
  };
}

/** Where the sheet has got to with the head of department. */
export function moderationColumn(header = "Moderation"): ColumnDef<ResultSheetLike> {
  return {
    id: "moderation",
    header,
    cell: ({ row }) => <SheetStateBadge status={row.original.status} />,
  };
}

/** The same state seen from the office's side: held, ready, or out. */
export function publishColumn(): ColumnDef<ResultSheetLike> {
  return {
    id: "publish",
    header: "Publish",
    cell: ({ row }) => <PublishStateBadge status={row.original.status} />,
  };
}

export function publishedOnColumn(): ColumnDef<ResultSheetLike> {
  return {
    id: "publishedAt",
    header: "Published",
    cell: ({ row }) => <RecordCell kind="date" value={row.original.publishedAt ? formatDay(row.original.publishedAt) : undefined} />,
  };
}

/**
 * The row's verbs, behind one trigger.
 *
 * A menu rather than buttons: a sheet carries up to five verbs at once —
 * marks, submit, approve, send back, publish — and spelling them out put more
 * than a thousand pixels of text in the last cell of a table that has none to
 * spare. The trigger is named for the sheet it belongs to, because a queue of
 * forty rows otherwise announces forty controls with the same name.
 */
export function sheetActionsColumn({
  workflow,
  onOpen,
  onEdit,
}: {
  workflow: ReturnType<typeof useResultSheetWorkflow>;
  onOpen?: (sheet: ResultSheetLike) => void;
  onEdit?: (sheet: ResultSheetLike) => void;
}): ColumnDef<ResultSheetLike> {
  return {
    id: "verbs",
    // An affordance, not a field — but the head still needs the cell, or every
    // column below it shifts by one.
    header: () => <span className="sr-only">Row actions</span>,
    cell: ({ row }) => (
      <RecordActions
        layout="menu"
        label={`Row actions for ${row.original.title}`}
        resource="schools.results"
        verbs={workflow.verbsFor(row.original, { onOpen, onEdit })}
      />
    ),
  };
}

/**
 * The same sheets at 390px.
 *
 * Seven columns on a phone is a sideways scroll showing one and a half of
 * them, so below `md` the table is a list: the mark, the title, and the one
 * line that tells two sheets apart, with the state as the last word on it —
 * a `Badge` in the row's trailing slot is sized for a chevron and gets clipped
 * mid-word. Tapping a row opens the sheet's marks and its moderation trail,
 * which is what somebody holding a phone came for; the workflow verbs stay on
 * the desktop table, where there is room to say what each one does.
 */
export function SheetMobileList({
  rows,
  onOpen,
  empty,
}: {
  rows: ResultSheetLike[];
  onOpen: (sheet: ResultSheetLike) => void;
  empty?: ReactNode;
}) {
  return (
    <MobileList>
      {rows.length === 0 ? (
        <MobileListEmpty>{empty}</MobileListEmpty>
      ) : (
        rows.map((sheet) => (
          <MobileList.Row
            key={sheet.id}
            leading={<RecordMark kind="document" name={sheet.title} size="sm" />}
            title={sheet.title}
            subtitle={[
              sheetClassName(sheet),
              sheet.term.name,
              `${linesOf(sheet)} marked`,
              SHEET_STATE_LABELS[sheet.status],
            ]
              .filter(Boolean)
              .join(" · ")}
            onClick={() => onOpen(sheet)}
          />
        ))
      )}
    </MobileList>
  );
}