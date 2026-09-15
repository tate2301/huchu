"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordNameCell } from "@/components/schools/common/identity-cell";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { RecordCell } from "@/components/records/record-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
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
import { PublishWindowDialog } from "@/components/schools/results/publish-window-dialog";
import {
  SheetMobileList,
  averageColumn,
  linesColumn,
  moderationColumn,
  publishedOnColumn,
  sheetActionsColumn,
  sheetClassName,
  sheetColumn,
} from "@/components/schools/results/sheet-columns";
import { SheetDetailDialog } from "@/components/schools/results/sheet-detail-dialog";
import {
  SHEET_STATE_LABELS,
  SHEET_STATE_OPTIONS,
  WINDOW_STATE_LABELS,
  WINDOW_STATE_OPTIONS,
  WindowStateBadge,
  formatDayTime,
} from "@/components/schools/results/sheet-state";
import { useResultSheetWorkflow } from "@/components/schools/results/use-sheet-workflow";

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

/** What a window covers, as one phrase. */
function windowScope(record: PublishWindowRecord) {
  return record.class
    ? [record.class.name, record.stream?.name].filter(Boolean).join(" ")
    : "The whole school";
}

export function PublishingContent() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<PublishView>("windows");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [windowStateFilter, setWindowStateFilter] = useState("");
  const [search, setSearch] = useState("");
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
    const typed = search.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (stateFilter && sheet.status !== stateFilter) return false;
      if (needle && !sheet.title.toLowerCase().includes(needle)) return false;
      if (
        typed &&
        !`${sheet.title} ${sheetClassName(sheet)} ${sheet.term.name}`
          .toLowerCase()
          .includes(typed)
      ) {
        return false;
      }
      return true;
    });
  }, [sheets, stateFilter, subjectName, search]);

  const publishedRows = useMemo(
    () => filteredSheets.filter((sheet) => sheet.status === "PUBLISHED"),
    [filteredSheets],
  );

  // The dashboard endpoint returns every window for the tenant, so the same
  // year-group and term filters the sheets use are applied here by hand.
  const filteredWindows = useMemo(() => {
    const typed = search.trim().toLowerCase();
    return windows.filter((row) => {
      if (windowStateFilter && row.status !== windowStateFilter) return false;
      if (termFilter && row.term.id !== termFilter) return false;
      if (classFilter && row.class && row.class.id !== classFilter) return false;
      if (streamFilter && row.stream && row.stream.id !== streamFilter) return false;
      if (typed && !`${windowScope(row)} ${row.term.name}`.toLowerCase().includes(typed)) {
        return false;
      }
      return true;
    });
  }, [windows, windowStateFilter, termFilter, classFilter, streamFilter, search]);

  const narrowing = [
    classes.find((row) => row.id === classFilter)?.name ?? null,
    streams.find((row) => row.id === streamFilter)?.name ?? null,
    subjectName || null,
    terms.find((term) => term.id === termFilter)?.name ?? null,
    view === "windows"
      ? windowStateFilter
        ? WINDOW_STATE_LABELS[windowStateFilter as PublishWindowStatus]
        : null
      : stateFilter
        ? SHEET_STATE_LABELS[stateFilter as ResultSheetStatus]
        : null,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setClassFilter("");
    setStreamFilter("");
    setSubjectFilter("");
    setTermFilter("");
    setStateFilter("");
    setWindowStateFilter("");
    setSearch("");
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

  const sheetColumns = useMemo(
    () => [
      sheetColumn(),
      moderationColumn("State"),
      linesColumn(),
      averageColumn(),
      publishedOnColumn(),
      sheetActionsColumn({ workflow, onOpen: (sheet) => setOpenSheetId(sheet.id) }),
    ],
    [workflow],
  );

  const windowColumns = useMemo<ColumnDef<PublishWindowRecord>[]>(
    () => [
      {
        id: "scope",
        header: "Covers",
        // The same identity grammar the sheets use: what it covers, with the
        // term it covers it for on the line underneath. A window scoped to the
        // whole school says so in words rather than leaving the class blank —
        // an empty cell there reads as a window nobody finished setting up.
        cell: ({ row }) => (
          <RecordNameCell
            kind="class"
            name={windowScope(row.original)}
            reference={row.original.term.name}
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: ({ row }) => <WindowStateBadge status={row.original.status} />,
      },
      {
        id: "openAt",
        header: "Opens",
        cell: ({ row }) => <RecordCell kind="date" value={formatDayTime(row.original.openAt)} />,
      },
      {
        id: "closeAt",
        header: "Closes",
        cell: ({ row }) => <RecordCell kind="date" value={formatDayTime(row.original.closeAt)} />,
      },
      {
        id: "notes",
        header: "Notes",
        cell: ({ row }) => <RecordCell value={row.original.notes} />,
      },
      {
        id: "verbs",
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => {
          const record = row.original;
          const nextState: PublishWindowStatus =
            record.status === "CLOSED" ? "OPEN" : "CLOSED";
          return (
            // Every verb here is gated on `publish`, which is the grant the
            // window endpoints themselves check — including the delete, so the
            // button and the route cannot disagree.
            <RecordActions
              layout="menu"
              label={`Row actions for the ${windowScope(record)} window`}
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

  const narrowed = narrowing.length > 0 || Boolean(search.trim());

  const windowsEmpty = narrowed ? (
    <NothingMatched what="windows" filters={narrowing} search={search} onClear={clearFilters} />
  ) : (
    <NothingYet
      title="No publish windows yet"
      body="Until one is open, approved sheets stay inside the school. Open a window for the term, or for one year group at a time."
    />
  );

  const sheetsEmpty = narrowed ? (
    <NothingMatched what="sheets" filters={narrowing} search={search} onClear={clearFilters} />
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
  );

  const shownSheets = view === "published" ? publishedRows : filteredSheets;

  return (
    <SchoolsPage
      band={
        /*
          The same eight numbers as the moderation queue, in the same order:
          this and that screen are two halves of one job, and a band that
          renamed its chips between them would make an office worker re-read
          the strip every time they crossed over.
        */
        <PageBand
          chips={[
            { label: "Draft", value: summary?.draftSheets ?? "—" },
            {
              label: "Submitted",
              value: summary?.submittedSheets ?? "—",
              tone: "warn",
              href: "/schools/results/moderation",
            },
            {
              label: "Sent back",
              value: summary?.hodRejectedSheets ?? "—",
              tone: "danger",
              href: "/schools/results/moderation",
            },
            { label: "Approved", value: summary?.hodApprovedSheets ?? "—", tone: "success" },
            { label: "Published", value: summary?.publishedSheets ?? "—", tone: "brand" },
            { label: "Windows open", value: summary?.openPublishWindows ?? "—", tone: "success" },
            { label: "Windows scheduled", value: summary?.scheduledPublishWindows ?? "—" },
            { label: "Windows closed", value: summary?.closedPublishWindows ?? "—" },
          ]}
        />
      }
    >
      <PageChrome title="Publishing">
        <CreateButton
          resource="schools.results"
          action="publish"
          label="New publish window"
          onSelect={() => {
            setWindowFor(null);
            setWindowOpen(true);
          }}
        />
      </PageChrome>

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
        <div className="space-y-2">
          <TableControls
            sticky
            search={
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder={
                  view === "windows" ? "Search windows" : "Search sheet, class or term"
                }
              />
            }
            filterCount={activeFilterCount(
              classFilter,
              streamFilter,
              termFilter,
              view === "windows" ? windowStateFilter : subjectFilter,
              view === "windows" ? "" : stateFilter,
            )}
            filters={
              <>
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
                {/* A control that only makes sense in one view disappears from
                    the row rather than reshaping it: a window has no subject
                    and a sheet has no window state. */}
                {view === "windows" ? (
                  <FilterSelect
                    label="State"
                    allLabel="Any state"
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
                      label="State"
                      allLabel="Any state"
                      value={stateFilter}
                      options={SHEET_STATE_OPTIONS}
                      onChange={setStateFilter}
                    />
                  </>
                )}
              </>
            }
            count={
              resultsQuery.isLoading
                ? null
                : view === "windows"
                  ? `${filteredWindows.length} of ${windows.length}`
                  : `${shownSheets.length} of ${sheets.length}`
            }
            actions={
              narrowed ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear the filters
                </Button>
              ) : null
            }
          />

          {view === "windows" ? (
            <DataTable
              data={filteredWindows}
              columns={windowColumns}
              features={{ globalFilter: false }}
              pagination={{ enabled: true }}
              exportConfig={{
                enabled: true,
                title: "Publish windows",
                fileName: "publish-windows",
              }}
              mobileListRenderer={({ rows: shown }) => (
                <MobileList>
                  {shown.length === 0 ? (
                    <MobileListEmpty>{windowsEmpty}</MobileListEmpty>
                  ) : (
                    shown.map(({ row }) => (
                      <MobileList.Row
                        key={row.id}
                        static
                        title={windowScope(row)}
                        subtitle={[
                          row.term.name,
                          WINDOW_STATE_LABELS[row.status],
                          `${formatDayTime(row.openAt)} – ${formatDayTime(row.closeAt)}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      />
                    ))
                  )}
                </MobileList>
              )}
              emptyState={
                resultsQuery.isLoading ? (
                  <TableRowsSkeleton
                    rows={6}
                    headers={["Covers", "Status", "Opens", "Closes", "Notes", ""]}
                    columns={[
                      { avatar: true, twoLine: true },
                      { width: 100, badge: true },
                      { width: 120 },
                      { width: 120 },
                      { width: 160 },
                      { width: 44 },
                    ]}
                  />
                ) : (
                  windowsEmpty
                )
              }
            />
          ) : (
            <DataTable
              data={shownSheets}
              columns={sheetColumns}
              features={{ globalFilter: false }}
              pagination={{ enabled: true }}
              exportConfig={{
                enabled: true,
                title: view === "published" ? "Published sheets" : "All result sheets",
                fileName: view === "published" ? "published-sheets" : "result-sheets",
              }}
              mobileListRenderer={({ rows: shown }) => (
                <SheetMobileList
                  rows={shown.map(({ row }) => row)}
                  onOpen={(sheet) => setOpenSheetId(sheet.id)}
                  empty={sheetsEmpty}
                />
              )}
              emptyState={
                resultsQuery.isLoading ? (
                  <TableRowsSkeleton
                    headers={["Sheet", "State", "Marks", "Mean", "Published", ""]}
                    columns={[
                      { avatar: true, twoLine: true },
                      { width: 110, badge: true },
                      { width: 70, align: "right" },
                      { width: 80, align: "right" },
                      { width: 90 },
                      { width: 44 },
                    ]}
                  />
                ) : (
                  sheetsEmpty
                )
              }
            />
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
    </SchoolsPage>
  );
}
