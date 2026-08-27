"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import {
  deletePublishWindow,
  updatePublishWindow,
  type PublishWindowRecord,
  type PublishWindowStatus,
  type ResultSheetLike,
  type ResultSheetStatus,
} from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import { PublishWindowDialog } from "./publish-window-dialog";
import { SheetDetailDialog } from "./sheet-detail-dialog";
import {
  SHEET_STATE_LABELS,
  SHEET_STATE_OPTIONS,
  SheetStateBadge,
  WINDOW_STATE_OPTIONS,
  WindowStateBadge,
  formatDay,
  formatDayTime,
} from "./sheet-state";
import { useResultSheetWorkflow } from "./use-sheet-workflow";

/**
 * Publishing: the windows marks may go out through, and the sheets going out.
 *
 * `publish` and `unpublish` had no call site either, so an approved sheet could
 * be approved for ever and a published one could never be pulled back — the two
 * things this screen exists to do were the two things it could not do. Both
 * verbs now sit on the rows they act on, and pulling a sheet back captures the
 * reason the endpoint asks for.
 *
 * Publish windows themselves are being moved to master data, where the rest of
 * the school's grading configuration lives; they stay readable and editable
 * here because this is where somebody notices a window is shut.
 */

type PublishView = "windows" | "published" | "all";

export function PublishingContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<PublishView>("windows");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [windowStateFilter, setWindowStateFilter] = useState("");
  const [windowFor, setWindowFor] = useState<PublishWindowRecord | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<unknown>(null);
  const [busyWindowId, setBusyWindowId] = useState<string | null>(null);

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
    queryKey: ["schools", "results", "publishing", classFilter, streamFilter, termFilter],
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
  const windows = useMemo<PublishWindowRecord[]>(
    () => resultsQuery.data?.publishWindows ?? [],
    [resultsQuery.data],
  );

  const subjectName = useMemo(
    () => subjects.find((subject) => subject.id === subjectFilter)?.name ?? "",
    [subjects, subjectFilter],
  );

  const filteredSheets = useMemo(() => {
    const needle = subjectName.toLowerCase();
    return sheets.filter((sheet) => {
      if (stateFilter && sheet.status !== stateFilter) return false;
      if (needle && !sheet.title.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [sheets, stateFilter, subjectName]);

  const publishedRows = useMemo(
    () => filteredSheets.filter((sheet) => sheet.status === "PUBLISHED"),
    [filteredSheets],
  );

  // The dashboard endpoint returns every window for the tenant, so the same
  // year-group and term filters the sheets use are applied here by hand.
  const filteredWindows = useMemo(
    () =>
      windows.filter((row) => {
        if (windowStateFilter && row.status !== windowStateFilter) return false;
        if (termFilter && row.term.id !== termFilter) return false;
        if (classFilter && row.class && row.class.id !== classFilter) return false;
        if (streamFilter && row.stream && row.stream.id !== streamFilter) return false;
        return true;
      }),
    [windows, windowStateFilter, termFilter, classFilter, streamFilter],
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
    setWindowStateFilter("");
  };

  const runWindow = useCallback(
    (id: string, work: () => Promise<unknown>) => {
      setBusyWindowId(id);
      setWindowError(null);
      void work()
        .then(() => queryClient.invalidateQueries({ queryKey: ["schools", "results"] }))
        .catch((cause: unknown) => setWindowError(cause))
        .finally(() => setBusyWindowId(null));
    },
    [queryClient],
  );

  const sheetColumns = useMemo<ColumnDef<ResultSheetLike>[]>(
    () => [
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
        cell: ({ row }) => <NumericCell>{formatDay(row.original.publishedAt)}</NumericCell>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.results"
            verbs={workflow.verbsFor(row.original, {
              onOpen: (sheet) => setOpenSheetId(sheet.id),
            })}
          />
        ),
      },
    ],
    [workflow],
  );

  const windowColumns = useMemo<ColumnDef<PublishWindowRecord>[]>(
    () => [
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <WindowStateBadge status={row.original.status} />,
      },
      {
        id: "scope",
        header: "Scope",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.term.name}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.class?.name ?? "All classes"}
              {row.original.stream ? ` / ${row.original.stream.name}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "openAt",
        header: "Open",
        cell: ({ row }) => (
          <NumericCell align="left">{formatDayTime(row.original.openAt)}</NumericCell>
        ),
      },
      {
        id: "closeAt",
        header: "Close",
        cell: ({ row }) => (
          <NumericCell align="left">{formatDayTime(row.original.closeAt)}</NumericCell>
        ),
      },
      {
        id: "notes",
        header: "Notes",
        cell: ({ row }) => row.original.notes || "—",
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const record = row.original;
          const nextState: PublishWindowStatus =
            record.status === "CLOSED" ? "OPEN" : "CLOSED";
          return (
            // Every verb here is gated on `publish`, which is the grant the
            // window endpoints themselves check — including the delete, so the
            // button and the route cannot disagree.
            <RecordActions
              resource="schools.results"
              verbs={[
                {
                  label: "Edit",
                  action: "publish",
                  onSelect: () => {
                    setWindowFor(record);
                    setWindowOpen(true);
                  },
                },
                {
                  label: record.status === "CLOSED" ? "Reopen" : "Close",
                  action: "publish",
                  tone: record.status === "CLOSED" ? "default" : "warning",
                  loading: busyWindowId === record.id,
                  confirm:
                    record.status === "CLOSED"
                      ? undefined
                      : {
                          title: "Close this window",
                          description:
                            "Approved sheets in its scope stop being publishable until a window covering them opens again.",
                          confirmLabel: "Close it",
                        },
                  onSelect: () =>
                    runWindow(record.id, () =>
                      updatePublishWindow(record.id, { status: nextState }),
                    ),
                },
                {
                  label: "Delete",
                  action: "publish",
                  tone: "danger",
                  loading: busyWindowId === record.id,
                  confirm: {
                    title: "Delete this window",
                    description:
                      "The window goes for good. Sheets already published through it stay published.",
                    confirmLabel: "Delete the window",
                  },
                  onSelect: () => runWindow(record.id, () => deletePublishWindow(record.id)),
                },
              ]}
            />
          );
        },
      },
    ],
    [busyWindowId, runWindow],
  );

  return (
    <div className="space-y-4">
      <PageHeading
        title="Results publishing"
        description="The windows marks may go out through, and every sheet that has gone out."
        primaryAction={
          <CreateButton
            resource="schools.results"
            action="publish"
            label="New publish window"
            onSelect={() => {
              setWindowFor(null);
              setWindowOpen(true);
            }}
          />
        }
      />

      <PageBand
        chips={[
          { label: "Ready", value: summary?.hodApprovedSheets ?? 0, tone: "success" },
          { label: "Published", value: summary?.publishedSheets ?? 0, tone: "brand" },
          { label: "Windows open", value: summary?.openPublishWindows ?? 0, tone: "success" },
          { label: "Scheduled", value: summary?.scheduledPublishWindows ?? 0 },
          { label: "Closed", value: summary?.closedPublishWindows ?? 0 },
        ]}
      />

      {workflow.error ? <SaveError what="That sheet" error={workflow.error} /> : null}
      {windowError ? <SaveError what="That publish window" error={windowError} /> : null}
      {resultsQuery.error ? (
        <LoadError
          what="the publishing screen"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}

      <VerticalDataViews
        items={[
          { id: "windows", label: "Publish windows", count: filteredWindows.length },
          { id: "published", label: "Published", count: publishedRows.length },
          { id: "all", label: "All sheets", count: filteredSheets.length },
        ]}
        value={view}
        onValueChange={(next) => setView(next as PublishView)}
        railLabel="Publishing views"
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
              label="Term"
              allLabel="Every term"
              value={termFilter}
              options={terms.map((term) => ({ value: term.id, label: term.name }))}
              onChange={setTermFilter}
            />
            {view === "windows" ? (
              <FilterSelect
                label="Status"
                allLabel="Any status"
                value={windowStateFilter}
                options={WINDOW_STATE_OPTIONS}
                onChange={setWindowStateFilter}
              />
            ) : (
              <>
                <FilterSelect
                  label="Subject"
                  allLabel="Every subject"
                  value={subjectFilter}
                  options={subjects.map((subject) => ({
                    value: subject.id,
                    label: subject.name,
                  }))}
                  onChange={setSubjectFilter}
                />
                <FilterSelect
                  label="Status"
                  allLabel="Any status"
                  value={stateFilter}
                  options={SHEET_STATE_OPTIONS}
                  onChange={setStateFilter}
                />
              </>
            )}
          </FilterBar>

          {view === "windows" ? (
            <Card
              flush
              title="Publish windows"
              subtitle="Approved marks only leave the school while a window covering them is open"
            >
              {resultsQuery.isLoading ? (
                <TableRowsSkeleton
                  columns={[
                    { width: 100 },
                    { twoLine: true },
                    { width: 120 },
                    { width: 120 },
                    { width: 160 },
                  ]}
                  rows={6}
                />
              ) : (
                <DataTable
                  data={filteredWindows}
                  columns={windowColumns}
                  edgeToEdge
                  searchPlaceholder="Search publish windows"
                  searchBehavior="instant"
                  pagination={{ enabled: true }}
                  exportConfig={{
                    enabled: true,
                    title: "Publish windows",
                    fileName: "publish-windows",
                  }}
                  emptyState={
                    windows.length === 0 ? (
                      <NothingYet
                        title="No publish windows yet"
                        body="Until one is open, approved sheets stay inside the school. Open a window for the term, or for one year group at a time."
                      />
                    ) : (
                      <NothingMatched
                        what="windows"
                        filters={narrowing}
                        onClear={clearFilters}
                      />
                    )
                  }
                />
              )}
            </Card>
          ) : (
            <Card
              flush
              title={view === "published" ? "Published sheets" : "All result sheets"}
              subtitle={
                view === "published"
                  ? "Out with families — pull one back and the reason is recorded against it"
                  : "Every sheet in the school, whatever state it is in"
              }
            >
              {resultsQuery.isLoading ? (
                <TableRowsSkeleton
                  columns={[
                    { twoLine: true },
                    { width: 110 },
                    { width: 70 },
                    { width: 80 },
                    { width: 90 },
                  ]}
                />
              ) : (
                <DataTable
                  data={view === "published" ? publishedRows : filteredSheets}
                  columns={sheetColumns}
                  edgeToEdge
                  searchPlaceholder="Search result sheets"
                  searchBehavior="instant"
                  pagination={{ enabled: true }}
                  exportConfig={{
                    enabled: true,
                    title: view === "published" ? "Published sheets" : "All result sheets",
                    fileName: view === "published" ? "published-sheets" : "result-sheets",
                  }}
                  emptyState={
                    narrowing.length > 0 ? (
                      <NothingMatched what="sheets" filters={narrowing} onClear={clearFilters} />
                    ) : view === "published" ? (
                      <NothingLeftToDo
                        title="Nothing published yet"
                        body="Sheets appear here once a head of department has approved them and the office has released them through an open window."
                      />
                    ) : (
                      <NothingYet
                        title="No result sheets yet"
                        body="Sheets appear once a class's marks have been written to one."
                      />
                    )
                  }
                />
              )}
            </Card>
          )}
        </div>
      </VerticalDataViews>

      {windowOpen ? (
        <PublishWindowDialog
          key={windowFor?.id ?? "new"}
          onOpenChange={(open) => {
            setWindowOpen(open);
            if (!open) setWindowFor(null);
          }}
          window={windowFor}
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
