"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import {
  fetchResultSheets,
  type ResultSheetLike,
  type ResultSheetStatus,
} from "@/lib/schools/results-v2";
import { ResultsViews } from "@/components/schools/results/results-views";
import {
  SheetMobileList,
  linesColumn,
  moderationColumn,
  publishColumn,
  sheetActionsColumn,
  sheetClassName,
  sheetColumn,
} from "@/components/schools/results/sheet-columns";
import { SheetDetailDialog } from "@/components/schools/results/sheet-detail-dialog";
import { SheetFormDialog } from "@/components/schools/results/sheet-form-dialog";
import {
  SHEET_STATE_LABELS,
  SHEET_STATE_OPTIONS,
} from "@/components/schools/results/sheet-state";
import { useResultSheetWorkflow } from "@/components/schools/results/use-sheet-workflow";

/**
 * The sheets the signed-in person may actually work on.
 *
 * It reads `/api/v2/schools/results/sheets` rather than the dashboard endpoint
 * the overview uses, because that route narrows itself to a teacher's own
 * class and subject assignments. A subject teacher opening this sees her own
 * sheets and nothing else; the office sees the school. Same rows, same
 * columns, same verbs — only the endpoint differs, which is why the two are
 * segments of one screen rather than two rail entries, and why the row is
 * composed in `sheet-columns.tsx` rather than here.
 *
 * The rows are grouped by year group, which is how a school talks about its
 * mark sheets, and sorted by it — an alphabet applied to a list that is not in
 * alphabetical order is worse than no headings at all.
 */

export function MarkSheetsContent() {
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<ResultSheetLike | null>(null);
  const [formOpen, setFormOpen] = useState(false);
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

  // The state cut stays client-side so the row count on the filter row keeps
  // a stable denominator — asking the server for one state at a time would
  // make "12 of 12" out of every choice.
  const sheetsQuery = useQuery({
    queryKey: ["schools", "results", "sheets", classFilter, streamFilter, termFilter, search],
    queryFn: () =>
      fetchResultSheets({
        page: 1,
        limit: 100,
        classId: classFilter || undefined,
        streamId: streamFilter || undefined,
        termId: termFilter || undefined,
        search: search.trim() || undefined,
      }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === classFilter)?.streams ?? [],
    [classes, classFilter],
  );

  const sheets = useMemo(() => sheetsQuery.data?.data ?? [], [sheetsQuery.data]);

  const subjectName = useMemo(
    () => subjects.find((subject) => subject.id === subjectFilter)?.name ?? "",
    [subjects, subjectFilter],
  );

  // Sorted by the heading it is about to be grouped under, because the
  // endpoint orders by `updatedAt` and a grouping applied to that order comes
  // out as Form 2, Form 4, Form 2 again.
  const visible = useMemo(() => {
    const needle = subjectName.toLowerCase();
    return sheets
      .filter((sheet) => {
        if (stateFilter && sheet.status !== stateFilter) return false;
        if (needle && !sheet.title.toLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((a, b) => sheetClassName(a).localeCompare(sheetClassName(b)));
  }, [sheets, stateFilter, subjectName]);

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
    setSearch("");
  };

  const openForm = (sheet: ResultSheetLike | null) => {
    setFormFor(sheet);
    setFormOpen(true);
  };

  const columns = useMemo(
    () => [
      sheetColumn(),
      linesColumn(),
      moderationColumn("State"),
      publishColumn(),
      sheetActionsColumn({
        workflow,
        onOpen: (sheet) => setOpenSheetId(sheet.id),
        onEdit: (sheet) => openForm(sheet),
      }),
    ],
    [workflow],
  );

  const nothingAtAll =
    !sheetsQuery.isLoading && sheets.length === 0 && narrowing.length === 0 && !search.trim();

  const emptyState = nothingAtAll ? (
    <NothingYet
      title="No mark sheets yet"
      body="Sheets appear here when a mark book is written to one under a year group's assessments, or when you raise one by hand."
    />
  ) : (
    <NothingMatched
      what="mark sheets"
      filters={narrowing}
      search={search}
      onClear={clearFilters}
    />
  );

  return (
    // No band. The five state tallies were counted off the very rows the
    // table is drawing, above filters that did not govern them; the State
    // filter asks that question and the row count answers it.
    <SchoolsPage>
      <PageChrome title="Mark sheets">
        <CreateButton
          resource="schools.results"
          label="New mark sheet"
          onSelect={() => openForm(null)}
        />
      </PageChrome>

      {workflow.error ? <SaveError what="That sheet" error={workflow.error} /> : null}
      {sheetsQuery.error ? (
        <LoadError
          what="the mark sheets"
          error={sheetsQuery.error}
          onRetry={() => void sheetsQuery.refetch()}
        />
      ) : null}

      <TableControls
        sticky
        tabs={<ResultsViews yours={sheets.length} />}
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search sheet, class or term"
          />
        }
        filterCount={activeFilterCount(
          classFilter,
          streamFilter,
          subjectFilter,
          termFilter,
          stateFilter,
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
              label="State"
              allLabel="Any state"
              value={stateFilter}
              options={SHEET_STATE_OPTIONS}
              onChange={setStateFilter}
            />
          </>
        }
        count={sheetsQuery.isLoading ? null : `${visible.length} of ${sheets.length}`}
        actions={
          narrowing.length > 0 || search.trim() ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear the filters
            </Button>
          ) : null
        }
      />

      <DataTable
        data={visible}
        columns={columns}
        features={{ globalFilter: false }}
        pagination={{ enabled: true }}
        exportConfig={{ enabled: true, title: "Mark sheets", fileName: "mark-sheets" }}
        rowGroup={(sheet) => ({ key: sheetClassName(sheet), label: sheetClassName(sheet) })}
        mobileListRenderer={({ rows: shown }) => (
          <SheetMobileList
            rows={shown.map(({ row }) => row)}
            onOpen={(sheet) => setOpenSheetId(sheet.id)}
            empty={emptyState}
          />
        )}
        emptyState={
          sheetsQuery.isLoading ? (
            <TableRowsSkeleton
              headers={["Sheet", "Marks", "State", "Publish", ""]}
              columns={[
                { avatar: true, twoLine: true },
                { width: 80, align: "right" },
                { width: 110, badge: true },
                { width: 100, badge: true },
                { width: 44 },
              ]}
            />
          ) : (
            emptyState
          )
        }
      />

      {formOpen ? (
        <SheetFormDialog
          key={formFor?.id ?? "new"}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setFormFor(null);
          }}
          sheet={formFor}
          defaultClassId={classFilter || undefined}
          defaultStreamId={streamFilter || undefined}
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
