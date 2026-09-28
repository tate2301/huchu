"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, MobileList } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { ClassFilter } from "@/components/schools/common/class-filter";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { PopulationTabs } from "@/components/schools/records/population-tabs";
import { DataTable } from "@/components/ui/data-table";
import { getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import {
  CLEARANCE_LABELS,
  CLEARANCE_ORDER,
  LEAVING_REASON_LABELS,
  closeLeaver,
  fetchLeaverQueue,
  markClearance,
  reopenLeaver,
  type ClearanceKind,
  type LeaverRow,
  type LeavingReason,
} from "@/lib/schools/leavers-v2";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import { RecordLeaverDialog } from "@/components/schools/leavers/record-leaver-dialog";
import { ClearanceDialog } from "@/components/schools/leavers/clearance-dialog";

/**
 * The leaving queue.
 *
 * `applyYearRollUp` graduates a pupil; this is where graduating leads. Five
 * marks — fees, library, bed, portal, documents — and a record that does not
 * close until each is settled or somebody overrides it with a reason.
 *
 * The marks are **stored**, not derived on every read. The derivation proposes
 * them and the evidence is shown beside them; a `DONE` against an outstanding
 * balance is the head waiving it, and that is a decision with a name on it.
 *
 * `Next step` is named for the job rather than the state: `Take the book back`
 * is something a librarian does this afternoon, and `LIBRARY: TODO` is a status
 * somebody has to translate first.
 *
 * `Gone, still owing` is a tab beside the queue rather than a table beneath it.
 * It is a second subject — a former pupil and a debt, against a record still
 * being cleared — and the search, the three filters and the `X of Y` count on
 * the control row only ever meant the queue.
 */

/**
 * What the `Next step` verb says, per mark.
 *
 * The copy lives here rather than in the query that finds the open mark: a
 * label is a thing a reader presses, and the server's job is to say which mark
 * is outstanding and what the evidence is. `Chase $210.00` is built from the
 * evidence, which is why the fees row is a function rather than a string.
 */
const NEXT_STEP: Record<ClearanceKind, (detail: string | null) => string> = {
  FEES: (detail) => `Chase ${detail?.split(" on ")[0] ?? "the fees"}`,
  LIBRARY: () => "Take the book back",
  BOARDING: () => "Free the bed",
  PORTAL: () => "Close the portal",
  RESULTS: () => "Raise the documents",
};

const CLEARANCE_OPTIONS = [
  { value: "not-cleared", label: "Not cleared" },
  { value: "cleared", label: "Cleared" },
];

type Tab = "open" | "closed" | "owing";

/** The five marks as one cell: `Fees · Library · Bed · Portal · Docs`. */
function ClearanceStrip({ row }: { row: LeaverRow }) {
  const byKind = new Map(row.clearances.map((mark) => [mark.kind, mark]));
  return (
    <span className="flex flex-wrap items-center gap-1">
      {CLEARANCE_ORDER.map((kind) => {
        const mark = byKind.get(kind);
        const state = mark?.state ?? "TODO";
        return (
          <Badge
            key={kind}
            tone={state === "DONE" ? "success" : state === "NOT_APPLICABLE" ? "neutral" : "warn"}
            title={mark?.detail ?? undefined}
          >
            {CLEARANCE_LABELS[kind]}
          </Badge>
        );
      })}
    </span>
  );
}

export function LeaversContent() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("open");
  const [reasonFilter, setReasonFilter] = useState("");
  const [clearanceFilter, setClearanceFilter] = useState("");
  const [classValue, setClassValue] = useState<{ classId: string; streamId: string }>({
    classId: "",
    streamId: "",
  });
  const [search, setSearch] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const [clearing, setClearing] = useState<{ leaver: LeaverRow; kind: ClearanceKind } | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * The queue is asked for one status at a time; `Gone, still owing` comes back
   * on every response whichever status was asked for, so that tab reads the
   * open queue's answer rather than firing a request of its own.
   */
  const status: "open" | "closed" = tab === "closed" ? "closed" : "open";
  const onQueue = tab !== "owing";

  const queueQuery = useQuery({
    queryKey: [
      "schools",
      "leavers",
      status,
      reasonFilter,
      clearanceFilter,
      classValue.classId,
      classValue.streamId,
      search,
    ],
    queryFn: () =>
      fetchLeaverQueue({
        status,
        reason: (reasonFilter as LeavingReason) || undefined,
        clearance: (clearanceFilter as "cleared" | "not-cleared") || undefined,
        // Sent to the query rather than filtered in the browser: a class is a
        // property of the pupil the leaver points at, and the list is paged.
        classId: classValue.classId || undefined,
        streamId: classValue.streamId || undefined,
        search: search.trim() || undefined,
      }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["schools", "leavers"] });
    void queryClient.invalidateQueries({ queryKey: ["schools", "alumni"] });
  };

  const mark = useMutation({
    mutationFn: (input: {
      leaverId: string;
      kind: ClearanceKind;
      state: "TODO" | "DONE" | "NOT_APPLICABLE";
      overrideNote?: string | null;
    }) => markClearance(input.leaverId, input),
    onSuccess: () => {
      setClearing(null);
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const close = useMutation({
    mutationFn: (leaverId: string) => closeLeaver(leaverId),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const reopen = useMutation({
    mutationFn: (leaverId: string) => reopenLeaver(leaverId),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const page = queueQuery.data;
  const tallies = page?.tallies;
  const rows = useMemo(() => page?.rows ?? [], [page]);

  // A handful of rows on a list the query client already holds, so summed on a
  // render that was going to happen anyway rather than memoised.
  const owing = page?.goneStillOwing ?? [];
  const owingTotal = owing.reduce((total, row) => total + Number(row.owed), 0);

  const columns = useMemo<ColumnDef<LeaverRow>[]>(
    () => [
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => (
          <PersonCell
            firstName={row.original.student.firstName}
            lastName={row.original.student.lastName}
            href={recordType("STUDENT").href(row.original.student.id)}
            reference={row.original.student.studentNo}
          />
        ),
      },
      {
        id: "yearGroup",
        header: "Class",
        cell: ({ row }) => (
          <RecordCell
            value={
              [row.original.student.className, row.original.student.streamName]
                .filter(Boolean)
                .join(" ") || null
            }
            className="text-[color:var(--text-muted)]"
          />
        ),
      },
      {
        id: "reason",
        header: "Leaving because",
        cell: ({ row }) => (
          <span className="block truncate text-sm">
            {LEAVING_REASON_LABELS[row.original.reason]}
            {row.original.reasonNote ? (
              <span className="block text-xs text-[color:var(--text-muted)]">
                {row.original.reasonNote}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: "lastDay",
        header: "Last day",
        // The child's last day, not the day the office pressed the button.
        cell: ({ row }) => (
          <span className="font-mono text-xs">{formatSchoolDate(row.original.lastDay)}</span>
        ),
      },
      {
        id: "clearance",
        header: "Fees · Library · Bed · Portal · Docs",
        cell: ({ row }) => <ClearanceStrip row={row.original} />,
      },
      {
        id: "nextStep",
        header: "Next step",
        cell: ({ row }) => {
          const leaver = row.original;
          const open = leaver.clearances.filter((entry) => entry.state === "TODO");
          if (open.length === 0) {
            return (
              <RecordActions
                layout="inline"
                size="sm"
                resource="schools.leavers"
                verbs={[
                  {
                    label: "Close the record",
                    action: "record",
                    loading: close.isPending,
                    confirm: {
                      title: `Close ${leaver.student.firstName} ${leaver.student.lastName}'s record`,
                      description:
                        "They come off the roll and onto the alumni register. Their marks, fees and register history stay exactly where they are.",
                      confirmLabel: "Close it",
                    },
                    onSelect: () => close.mutate(leaver.id),
                  },
                ]}
              />
            );
          }
          const first = open[0];
          return (
            <RecordActions
              layout="inline"
              size="sm"
              resource="schools.leavers"
              verbs={[
                {
                  label: NEXT_STEP[first.kind](first.detail),
                  action: "clear",
                  onSelect: () => setClearing({ leaver, kind: first.kind }),
                },
              ]}
            />
          );
        },
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) =>
          row.original.status === "CLOSED" ? (
            /*
              A pupil gets one leaving record — `SchoolLeaver.studentId` is
              unique — so a pupil who was withdrawn, came back and is now
              leaving properly is recorded on this one. `recordLeaver` refused
              the second departure with "reopen the first record", and until now
              nothing anywhere could.
            */
            <div className="flex justify-end">
              <RecordActions
                layout="inline"
                size="sm"
                resource="schools.leavers"
                verbs={[
                  {
                    label: "Reopen",
                    action: "record",
                    loading: reopen.isPending,
                    confirm: {
                      title: `Reopen ${row.original.student.firstName} ${row.original.student.lastName}'s record`,
                      description:
                        "They go back on the roll and the five marks are worked out again from where the fees, the books and the bed stand today. Their alumni record and everything on its timeline stay exactly as they are.",
                      confirmLabel: "Reopen it",
                    },
                    onSelect: () => reopen.mutate(row.original.id),
                  },
                ]}
              />
            </div>
          ) : (
            <div className="flex justify-end">
              <Button asChild variant="secondary" size="sm">
                <Link href={`/schools/leavers/documents?leaver=${row.original.id}`}>
                  Raise the documents
                </Link>
              </Button>
            </div>
          ),
      },
    ],
    [close, reopen],
  );

  return (
    <SchoolsPage>
      <PageChrome title="Leavers">
        <CreateButton
          resource="schools.leavers"
          label="Record a leaver"
          onSelect={() => setRecordOpen(true)}
        />
      </PageChrome>

      {actionError ? <SaveError what="That change" error={actionError} /> : null}

      <TableControls
        sticky
        tabs={
          <PopulationTabs<Tab>
            value={tab}
            onChange={setTab}
            tabs={[
              // How many are in the queue is the denominator of `X of Y` on the
              // row below, so the tab does not say it a second time. How many
              // former pupils left owing is read nowhere else on the screen, so
              // it is said here.
              { id: "open", label: "Still open" },
              { id: "closed", label: "Closed this year" },
              {
                id: "owing",
                label: "Gone, still owing",
                count: page ? owing.length : undefined,
              },
            ]}
          />
        }
        search={
          onQueue ? (
            <TableSearch value={search} onChange={setSearch} placeholder="Search leavers" />
          ) : undefined
        }
        filterCount={
          onQueue
            ? activeFilterCount(classValue.classId, reasonFilter, clearanceFilter)
            : undefined
        }
        // How many of the queue are in front of you. The owing tab counts
        // itself on the tab, so the row says nothing there rather than
        // counting the wrong table; the closed list has no total to sit
        // against, so it says how many came back and stops.
        count={
          onQueue && !queueQuery.isPending
            ? tab === "open"
              ? `${rows.length} of ${tallies?.inTheQueue ?? rows.length}`
              : `${rows.length}`
            : null
        }
        filters={
          onQueue ? (
            <>
              <ClassFilter
                allLabel="The whole school"
                value={classValue}
                onChange={setClassValue}
              />
              <FilterSelect
                label="Reason"
                allLabel="Any reason"
                value={reasonFilter}
                options={(Object.keys(LEAVING_REASON_LABELS) as LeavingReason[]).map(
                  (reason) => ({ value: reason, label: LEAVING_REASON_LABELS[reason] }),
                )}
                onChange={setReasonFilter}
              />
              {/* How many are not cleared is what this filter asks for: choose
                  `Not cleared` and the count beside it answers, against the
                  rows it is counting. */}
              <FilterSelect
                label="Clearance"
                allLabel="Any state"
                value={clearanceFilter}
                options={CLEARANCE_OPTIONS}
                onChange={setClearanceFilter}
              />
            </>
          ) : undefined
        }
      />

      {queueQuery.error ? (
        <LoadError
          what={onQueue ? "the leaving queue" : "the leavers who left owing"}
          error={queueQuery.error}
          onRetry={() => void queueQuery.refetch()}
        />
      ) : onQueue ? (
        <>
          <DataTable
            data={rows}
            columns={columns}
            features={{ sorting: false, globalFilter: false, pagination: false }}
            mobileListRenderer={({ rows: mobileRows }) => (
              <MobileList>
                {mobileRows.map(({ row }) => (
                  <MobileList.Row
                    key={row.id}
                    leading={
                      <RecordMark
                        kind="student"
                        name={`${row.student.firstName} ${row.student.lastName}`}
                        size="sm"
                      />
                    }
                    title={`${row.student.lastName}, ${row.student.firstName}`}
                    subtitle={`${LEAVING_REASON_LABELS[row.reason]} · ${row.nextStep}`}
                  />
                ))}
              </MobileList>
            )}
            emptyState={
              queueQuery.isPending ? (
                <TableRowsSkeleton
                  rows={6}
                  headers={[
                    "Pupil",
                    "Class",
                    "Leaving because",
                    "Last day",
                    "Fees · Library · Bed · Portal · Docs",
                    "Next step",
                    "",
                  ]}
                  columns={[
                    { avatar: true, twoLine: true },
                    { width: 110 },
                    { width: 180 },
                    { width: 110 },
                    { width: 260, badge: true },
                    { width: 170 },
                    { width: 170 },
                  ]}
                />
              ) : reasonFilter || clearanceFilter || search.trim() || classValue.classId ? (
                <NothingMatched
                  what="leavers"
                  filters={[
                    reasonFilter ? LEAVING_REASON_LABELS[reasonFilter as LeavingReason] : null,
                    CLEARANCE_OPTIONS.find((option) => option.value === clearanceFilter)?.label,
                  ].filter((entry): entry is string => Boolean(entry))}
                  search={search}
                  onClear={() => {
                    setReasonFilter("");
                    setClearanceFilter("");
                    setSearch("");
                    setClassValue({ classId: "", streamId: "" });
                  }}
                />
              ) : tab === "open" ? (
                <NothingLeftToDo
                  title="Nobody is waiting to leave"
                  body="Every record that was opened has been closed. This is the state the queue is for."
                />
              ) : (
                <NothingYet
                  title="No record has been closed this year"
                  body="A closed record is a pupil on the alumni register with their five marks settled."
                />
              )
            }
          />

          {/* The foot of the queue: what the rows above it come to. The money
              is the fees evidence on every FEES mark added up, and the
              documents line counts the rows whose Docs mark is still TODO —
              both are read here, against the list they are totalling, rather
              than in a strip over the controls. Only the open queue has them;
              a closed record is settled by definition. */}
          {tab === "open" && tallies && !queueQuery.isPending ? (
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-[color:var(--border)] px-1 py-2">
              <span className="text-xs font-semibold text-[color:var(--text-strong)]">
                Leaving with it unfinished
              </span>
              <span className="font-mono text-xs text-[color:var(--text-muted)]">
                <span
                  className={
                    Number(tallies.owingOnExit) > 0
                      ? "text-[color:var(--tone-warn)]"
                      : "text-[color:var(--tone-success)]"
                  }
                >
                  {formatSchoolMoney(tallies.owingOnExit)}
                </span>{" "}
                owing on exit · {tallies.documentsOutstanding} waiting on documents
              </span>
            </div>
          ) : null}
        </>
      ) : queueQuery.isPending ? (
        <TableRowsSkeleton
          rows={4}
          headers={["Former pupil", "Left because", "Still owed"]}
          columns={[{ twoLine: true }, { width: 200 }, { width: 130 }]}
        />
      ) : owing.length === 0 ? (
        <NothingLeftToDo
          title="Nobody has left owing"
          body="Every record closed this year closed with the fees settled behind it."
        />
      ) : (
        /* Its own tab rather than a filter on the queue: the pupil has gone,
           and what is left is a debt somebody has to decide whether to chase.
           Hidden inside the queue it would be found again a year later. */
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[color:var(--text-muted)]">
              <th className="py-1 font-normal">Former pupil</th>
              <th className="w-[200px] py-1 font-normal">Left because</th>
              <th className="w-[130px] py-1 text-right font-normal">Still owed</th>
            </tr>
          </thead>
          <tbody>
            {owing.map((row) => (
              <tr key={row.id} className="border-t border-[color:var(--border-subtle)]">
                <td className="py-1.5">
                  {row.student.lastName}, {row.student.firstName}
                  <span className="block font-mono text-[11px] text-[color:var(--text-muted)]">
                    {row.student.studentNo} · left {formatSchoolDate(row.lastDay)}
                  </span>
                </td>
                <td className="py-1.5 text-xs">{LEAVING_REASON_LABELS[row.reason]}</td>
                <td className="py-1.5 text-right font-mono text-xs text-[color:var(--status-error-text)]">
                  {formatSchoolMoney(row.owed)}
                </td>
              </tr>
            ))}
            {/* What the school is still out of pocket, summed from the column
                above rather than asserted beside it. */}
            <tr className="border-t-2 border-[color:var(--border)]">
              <td className="py-1.5 text-xs font-semibold">
                {owing.length} {owing.length === 1 ? "former pupil" : "former pupils"}
              </td>
              <td />
              <td className="py-1.5 text-right font-mono text-xs font-bold text-[color:var(--status-error-text)]">
                {formatSchoolMoney(owingTotal)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <RecordLeaverDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        onSaved={() => {
          setRecordOpen(false);
          invalidate();
        }}
      />

      <ClearanceDialog
        target={clearing}
        onOpenChange={(next) => {
          if (!next) setClearing(null);
        }}
        isSaving={mark.isPending}
        onSubmit={(values) =>
          clearing
            ? mark.mutate({
                leaverId: clearing.leaver.id,
                kind: clearing.kind,
                state: values.state,
                overrideNote: values.overrideNote,
              })
            : undefined
        }
      />
    </SchoolsPage>
  );
}
