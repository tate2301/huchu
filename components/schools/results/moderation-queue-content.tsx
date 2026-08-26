"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import type { ResultSheetLike, ResultSheetStatus } from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import { SheetDetailDialog } from "./sheet-detail-dialog";
import { SheetFormDialog } from "./sheet-form-dialog";
import {
  SHEET_STATE_LABELS,
  SHEET_STATE_OPTIONS,
  SheetStateBadge,
  formatDay,
  waitingFor,
  waitingMs,
} from "./sheet-state";
import { useResultSheetWorkflow } from "./use-sheet-workflow";

/**
 * The moderation queue: what a head of department has to look at, oldest first.
 *
 * It was a table with no buttons. `hod-approve` and `hod-request-changes` were
 * written, permission-gated and tested and had no call site anywhere, so
 * `HOD_APPROVED` was a state nobody could reach through the interface and every
 * queue was permanently full. The verbs on each row are those two endpoints.
 *
 * A queue's first column is age. Sorting by "recently updated" — which is what
 * this did — puts the sheet somebody just touched at the top and buries the one
 * that has been waiting nine days, which is exactly backwards for work that has
 * a deadline.
 */

type QueueView = "queue" | "all";

/**
 * Waiting since the sheet was handed over: a submitted sheet has been waiting
 * since it was submitted, and one that was sent back is waiting on the teacher,
 * so it is timed from when it was last touched.
 */
function waitingSince(sheet: ResultSheetLike) {
  return sheet.status === "SUBMITTED" ? (sheet.submittedAt ?? sheet.updatedAt) : sheet.updatedAt;
}

export function ModerationQueueContent() {
  const [view, setView] = useState<QueueView>("queue");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [formFor, setFormFor] = useState<ResultSheetLike | null>(null);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);

  const workflow = useResultSheetWorkflow();

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 100, isActive: true }),
  });

  const resultsQuery = useQuery({
    queryKey: ["schools", "results", "moderation", classFilter, streamFilter, termFilter],
    queryFn: () =>
      fetchSchoolsResultsData({
        page: 1,
        limit: 100,
        classId: classFilter || undefined,
        streamId: streamFilter || undefined,
        termId: termFilter || undefined,
      }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === classFilter)?.streams ?? [],
    [classes, classFilter],
  );
  const summary = resultsQuery.data?.summary;
  const sheets = useMemo<ResultSheetLike[]>(
    () => resultsQuery.data?.data ?? [],
    [resultsQuery.data],
  );

  const subjectName = useMemo(
    () => subjects.find((subject) => subject.id === subjectFilter)?.name ?? "",
    [subjects, subjectFilter],
  );

  const filtered = useMemo(() => {
    const needle = subjectName.toLowerCase();
    return sheets.filter((sheet) => {
      if (stateFilter && sheet.status !== stateFilter) return false;
      if (needle && !sheet.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [sheets, stateFilter, subjectName]);

  const queueRows = useMemo(
    () =>
      filtered
        .filter((sheet) => sheet.status === "SUBMITTED" || sheet.status === "HOD_REJECTED")
        .sort((a, b) => waitingMs(waitingSince(b)) - waitingMs(waitingSince(a))),
    [filtered],
  );
  const allRows = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      ),
    [filtered],
  );

  const narrowing = [
    classes.find((row) => row.id === classFilter)?.name ?? null,
    streams.find((row) => row.id === streamFilter)?.name ?? null,
    subjectName || null,
    terms.find((term) => term.id === termFilter)?.name ?? null,
    stateFilter ? SHEET_STATE_LABELS[stateFilter as ResultSheetStatus] : null,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setClassFilter("");
    setStreamFilter("");
    setSubjectFilter("");
    setTermFilter("");
    setStateFilter("");
  };

  const columns = useMemo<ColumnDef<ResultSheetLike>[]>(
    () => [
      {
        id: "waiting",
        header: "Waiting",
        cell: ({ row }) => (
          <div>
            <NumericCell align="left">{waitingFor(waitingSince(row.original))}</NumericCell>
            <div className="text-xs text-muted-foreground">
              since {formatDay(waitingSince(row.original))}
            </div>
          </div>
        ),
      },
      {
        id: "sheet",
        header: "Sheet",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.term.name} / {row.original.class.name}
              {row.original.stream ? ` / ${row.original.stream.name}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <SheetStateBadge status={row.original.status} />,
      },
      {
        id: "lines",
        header: "Lines",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.stats?.linesCount ?? row.original._count.lines}
          </NumericCell>
        ),
      },
      {
        id: "average",
        header: "Average",
        cell: ({ row }) => {
          const average = row.original.stats?.averageScore ?? null;
          return <NumericCell>{average === null ? "—" : average.toFixed(2)}</NumericCell>;
        },
      },
      {
        id: "published",
        header: "Published",
        cell: ({ row }) => (
          <NumericCell>{formatDay(row.original.publishedAt)}</NumericCell>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.results"
            verbs={workflow.verbsFor(row.original, {
              onOpen: (sheet) => setOpenSheetId(sheet.id),
              onEdit: (sheet) => setFormFor(sheet),
            })}
          />
        ),
      },
    ],
    [workflow],
  );

  const rows = view === "queue" ? queueRows : allRows;

  return (
    <div className="space-y-4">
      <PageHeading
        title="Results moderation"
        description="Sheets a head of department has to sign off before anything can be published."
      />

      <PageBand
        chips={[
          { label: "Waiting", value: summary?.submittedSheets ?? 0, tone: "warn" },
          { label: "Sent back", value: summary?.hodRejectedSheets ?? 0, tone: "danger" },
          { label: "Approved", value: summary?.hodApprovedSheets ?? 0, tone: "success" },
          {
            label: "Published",
            value: summary?.publishedSheets ?? 0,
            tone: "brand",
            href: "/schools/results/publish",
          },
        ]}
      />

      {workflow.error ? <SaveError what="That sheet" error={workflow.error} /> : null}
      {resultsQuery.error ? (
        <LoadError
          what="the moderation queue"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}

      <VerticalDataViews
        items={[
          { id: "queue", label: "Moderation queue", count: queueRows.length },
          { id: "all", label: "All sheets", count: allRows.length },
        ]}
        value={view}
        onValueChange={(next) => setView(next as QueueView)}
        railLabel="Moderation views"
      >
        <div className="space-y-4">
          <FilterBar>
            <FilterSelect
              label="Year group"
              allLabel="Every year group"
              value={classFilter}
              options={classes.map((row) => ({ value: row.id, label: row.name }))}
              onChange={(next) => {
                setClassFilter(next);
                setStreamFilter("");
              }}
            />
            <FilterSelect
              label="Class"
              allLabel="Every class"
              value={streamFilter}
              options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
              onChange={setStreamFilter}
            />
            <FilterSelect
              label="Subject"
              allLabel="Every subject"
              value={subjectFilter}
              options={subjects.map((subject) => ({ value: subject.id, label: subject.name }))}
              onChange={setSubjectFilter}
            />
            <FilterSelect
              label="Term"
              allLabel="Every term"
              value={termFilter}
              options={terms.map((term) => ({ value: term.id, label: term.name }))}
              onChange={setTermFilter}
            />
            <FilterSelect
              label="Status"
              allLabel="Any status"
              value={stateFilter}
              options={SHEET_STATE_OPTIONS}
              onChange={setStateFilter}
            />
          </FilterBar>

          <Card
            flush
            title={view === "queue" ? "Moderation queue" : "All result sheets"}
            subtitle={
              view === "queue"
                ? "Longest wait first — nothing publishes until these clear"
                : "Every sheet in the school, whatever state it is in"
            }
          >
            {resultsQuery.isLoading ? (
              <TableRowsSkeleton
                columns={[
                  { width: 100, twoLine: true },
                  { twoLine: true },
                  { width: 110 },
                  { width: 70 },
                  { width: 80 },
                  { width: 90 },
                ]}
              />
            ) : (
              <DataTable
                data={rows}
                columns={columns}
                edgeToEdge
                searchPlaceholder="Search moderation queue"
                searchBehavior="instant"
                pagination={{ enabled: true }}
                exportConfig={{ enabled: true, title: "Moderation queue", fileName: "moderation-queue" }}
                emptyState={
                  narrowing.length > 0 ? (
                    <NothingMatched what="sheets" filters={narrowing} onClear={clearFilters} />
                  ) : view === "queue" ? (
                    <NothingLeftToDo
                      title="Nothing waiting on moderation"
                      body="Every sheet handed in has been dealt with. New ones appear the moment a teacher submits."
                    />
                  ) : (
                    <NothingLeftToDo
                      title="No result sheets yet"
                      body="Sheets appear here once a class's marks have been written to one."
                    />
                  )
                }
              />
            )}
          </Card>
        </div>
      </VerticalDataViews>

      {formFor ? (
        <SheetFormDialog
          key={formFor.id}
          onOpenChange={(open) => {
            if (!open) setFormFor(null);
          }}
          sheet={formFor}
        />
      ) : null}
      <SheetDetailDialog
        sheetId={openSheetId}
        onOpenChange={(open) => {
          if (!open) setOpenSheetId(null);
        }}
      />
      {workflow.dialog}
    </div>
  );
}
