"use client";

import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordNameCell } from "@/components/schools/common/identity-cell";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { RecordCell } from "@/components/records/record-table";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { recordType } from "@/lib/records/registry";
import { fetchSchoolsClasses, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import {
  deletePublishWindow,
  updatePublishWindow,
  type PublishWindowRecord,
  type PublishWindowStatus,
} from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import { PublishWindowDialog } from "@/components/schools/results/publish-window-dialog";
import {
  WINDOW_STATE_LABELS,
  WINDOW_STATE_OPTIONS,
  WindowStateBadge,
  formatDayTime,
  windowScope,
} from "@/components/schools/results/sheet-state";

/**
 * Publishing: the windows marks may go out through.
 *
 * One subject, because the page is called Publishing and a publish window is
 * what it is about. It used to carry the sheets as well — a "Published" view
 * and an "All sheets" view behind the same rail — on the reasoning that
 * somebody looking at the windows is one question away from "and what actually
 * went out". That reasoning is how a screen ends up with a filter row that
 * governs half of it: the Subject and State dropdowns applied to the sheets
 * and meant nothing to a window, the window State dropdown meant nothing to a
 * sheet, and the control row reshaped itself depending on which half was in
 * view. Result sheets have their own screens — the overview at
 * `/schools/results` lists every sheet in the school with a Publish column and
 * a State filter that includes Published, and it carries the same publish and
 * unpublish verbs from `use-sheet-workflow.tsx`. Nothing was lost by dropping
 * the second table; the verbs were never unique to this page.
 *
 * `publish` and `unpublish` had no call site at all before that hook existed,
 * so an approved sheet could be approved for ever and a published one could
 * never be pulled back.
 *
 * Publish windows themselves are being moved to master data, where the rest of
 * the school's grading configuration lives; they stay readable and editable
 * here because this is where somebody notices a window is shut.
 */

export function PublishingContent() {
  const queryClient = useQueryClient();
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [windowStateFilter, setWindowStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [windowFor, setWindowFor] = useState<PublishWindowRecord | null>(null);
  const [windowOpen, setWindowOpen] = useState(false);
  const [windowError, setWindowError] = useState<unknown>(null);
  const [busyWindowId, setBusyWindowId] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
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
  const streams = useMemo(
    () => classes.find((row) => row.id === classFilter)?.streams ?? [],
    [classes, classFilter],
  );

  const windows = useMemo<PublishWindowRecord[]>(
    () => resultsQuery.data?.publishWindows ?? [],
    [resultsQuery.data],
  );

  // The dashboard endpoint returns every window for the tenant, so the same
  // year-group and term filters are applied here by hand.
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
    terms.find((term) => term.id === termFilter)?.name ?? null,
    windowStateFilter
      ? WINDOW_STATE_LABELS[windowStateFilter as PublishWindowStatus]
      : null,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setClassFilter("");
    setStreamFilter("");
    setTermFilter("");
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

  const windowColumns = useMemo<ColumnDef<PublishWindowRecord>[]>(
    () => [
      {
        id: "scope",
        header: "Covers",
        // The same identity grammar the sheets use: what it covers, with the
        // term it covers it for on the line underneath. A window scoped to the
        // whole school says so in words rather than leaving the class blank —
        // an empty cell there reads as a window nobody finished setting up.
        //
        // Where it is scoped to one year group, that year group is the way to
        // the year group; the school-wide window has no record to point at, so
        // it is a phrase and not a link.
        cell: ({ row }) => (
          <RecordNameCell
            kind="class"
            name={windowScope(row.original)}
            href={
              row.original.class ? recordType("CLASS").href(row.original.class.id) : null
            }
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

  return (
    // No band. The eight chips that stood here counted the whole term's sheets
    // and windows above filters that governed neither, and five of them were
    // about a subject this page no longer carries.
    <SchoolsPage>
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

      {windowError ? <SaveError what="That publish window" error={windowError} /> : null}
      {resultsQuery.error ? (
        <LoadError
          what="the publishing screen"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}

      <TableControls
        sticky
        search={
          <TableSearch value={search} onChange={setSearch} placeholder="Search windows" />
        }
        filterCount={activeFilterCount(
          classFilter,
          streamFilter,
          termFilter,
          windowStateFilter,
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
            <FilterSelect
              label="State"
              allLabel="Any state"
              value={windowStateFilter}
              options={WINDOW_STATE_OPTIONS}
              onChange={setWindowStateFilter}
            />
          </>
        }
        count={
          resultsQuery.isLoading ? null : `${filteredWindows.length} of ${windows.length}`
        }
        actions={
          narrowed ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear the filters
            </Button>
          ) : null
        }
      />

      {/* No card. The table is the page — the control row's hairline is the
          seam and the column header runs straight off the underside of it. */}
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
    </SchoolsPage>
  );
}
