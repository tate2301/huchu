"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton } from "@/components/schools/common/record-actions";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import type { ResultSheetLike, ResultSheetStatus } from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import {
  SheetMobileList,
  averageColumn,
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
 * One year group's mark sheets.
 *
 * A result sheet already belongs to a class, so listing every sheet in the
 * school and asking a head of department to find theirs was the same
 * one-giant-list problem the student directory had. The class is the route;
 * status is the filter, because "what is still in draft in Form 2" is the
 * question a HOD is actually asking in the week before reports go out.
 *
 * The rows are the same rows the overview and the queue draw, from the same
 * place — this screen is a third arrangement of one table, not a third idea of
 * what a mark sheet is.
 *
 * ── The filter row ─────────────────────────────────────────────────────────
 *
 * Each filter is named by its unnarrowed choice: Class = Every class, State =
 * Any state. Class is the stream within this year group — the route has already
 * answered "which form?" — and it is offered only when the year group has been
 * split into any. State is applied here rather than at the endpoint, so the
 * band chips above go on counting every state while one of them is in view.
 */
export function ClassResultsContent({
  classId,
  yearGroup,
  initialStreamId,
}: {
  classId: string;
  /** The year group's name, for the heading the page is titled by. */
  yearGroup: string;
  initialStreamId?: string;
}) {
  const [streamFilter, setStreamFilter] = useState(initialStreamId ?? "");
  const [statusFilter, setStatusFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<ResultSheetLike | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);

  const workflow = useResultSheetWorkflow();

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 100, isActive: true }),
  });

  // The state cut is applied here rather than sent to the server, so the band
  // chips above can go on counting every state while one of them is in view.
  const resultsQuery = useQuery({
    queryKey: ["schools", "results", "by-class", classId, streamFilter, termFilter],
    queryFn: () =>
      fetchSchoolsResultsData({
        page: 1,
        limit: 100,
        classId,
        streamId: streamFilter || undefined,
        termId: termFilter || undefined,
      }),
  });

  const sheets = useMemo<ResultSheetLike[]>(
    () => resultsQuery.data?.data ?? [],
    [resultsQuery.data],
  );
  const schoolClass = useMemo(
    () => (classesQuery.data?.data ?? []).find((row) => row.id === classId) ?? null,
    [classesQuery.data, classId],
  );
  const streams = schoolClass?.streams ?? [];
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);

  const counts = useMemo(() => {
    const tally: Record<ResultSheetStatus, number> = {
      DRAFT: 0,
      SUBMITTED: 0,
      HOD_APPROVED: 0,
      HOD_REJECTED: 0,
      PUBLISHED: 0,
    };
    for (const sheet of sheets) tally[sheet.status] += 1;
    return tally;
  }, [sheets]);

  const subjectName = useMemo(
    () => subjects.find((subject) => subject.id === subjectFilter)?.name ?? "",
    [subjects, subjectFilter],
  );

  const visible = useMemo(() => {
    const subjectNeedle = subjectName.toLowerCase();
    const typed = search.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (statusFilter && sheet.status !== statusFilter) return false;
      if (subjectNeedle && !sheet.title.toLowerCase().includes(subjectNeedle)) return false;
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
  }, [sheets, statusFilter, subjectName, search]);

  const narrowing = [
    streams.find((stream) => stream.id === streamFilter)?.name ?? null,
    statusFilter ? SHEET_STATE_LABELS[statusFilter as ResultSheetStatus] : null,
    subjectName || null,
    terms.find((term) => term.id === termFilter)?.name ?? null,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setStreamFilter("");
    setStatusFilter("");
    setSubjectFilter("");
    setTermFilter("");
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
      averageColumn(),
      sheetActionsColumn({
        workflow,
        onOpen: (sheet) => setOpenSheetId(sheet.id),
        onEdit: (sheet) => openForm(sheet),
      }),
    ],
    [workflow],
  );

  const narrowed = narrowing.length > 0 || Boolean(search.trim());

  const emptyState =
    sheets.length === 0 && !narrowed ? (
      <NothingYet
        title="No mark sheets for this year group yet"
        body="Sheets appear here when the mark book is written to one under the year group's assessments."
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
    <SchoolsPage
      band={
        <PageBand
          chips={[
            { label: "Draft", value: counts.DRAFT },
            { label: "Submitted", value: counts.SUBMITTED, tone: "warn" },
            { label: "Sent back", value: counts.HOD_REJECTED, tone: "danger" },
            { label: "Approved", value: counts.HOD_APPROVED, tone: "success" },
            { label: "Published", value: counts.PUBLISHED, tone: "brand" },
          ]}
        />
      }
    >
      {/* The bar carries the year group and the way back up to Results — a
          back link stranded in the body is a second header in a different
          place. */}
      <PageChrome
        title={`${yearGroup} marks`}
        backHref="/schools/results"
        backLabel="Results"
      >
        <CreateButton
          resource="schools.results"
          label="New mark sheet"
          onSelect={() => openForm(null)}
        />
      </PageChrome>

      {workflow.error ? <SaveError what="That sheet" error={workflow.error} /> : null}
      {resultsQuery.error ? (
        <LoadError
          what="the mark sheets"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}

      <TableControls
        sticky
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search mark sheets"
          />
        }
        filterCount={activeFilterCount(streamFilter, subjectFilter, termFilter, statusFilter)}
        filters={
          <>
            {streams.length > 0 ? (
              <FilterSelect
                label="Class"
                allLabel="Every class"
                value={streamFilter}
                options={streams.map((stream) => ({ value: stream.id, label: stream.name }))}
                onChange={setStreamFilter}
              />
            ) : null}
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
              value={statusFilter}
              options={SHEET_STATE_OPTIONS}
              onChange={setStatusFilter}
            />
          </>
        }
        count={resultsQuery.isLoading ? null : `${visible.length} of ${sheets.length}`}
        actions={
          narrowed ? (
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
        exportConfig={{
          enabled: true,
          title: `${yearGroup} marks`,
          fileName: "class-mark-sheets",
        }}
        mobileListRenderer={({ rows: shown }) => (
          <SheetMobileList
            rows={shown.map(({ row }) => row)}
            onOpen={(sheet) => setOpenSheetId(sheet.id)}
            empty={emptyState}
          />
        )}
        emptyState={
          resultsQuery.isLoading ? (
            <TableRowsSkeleton
              rows={6}
              headers={["Sheet", "Marks", "State", "Publish", "Mean", ""]}
              columns={[
                { avatar: true, twoLine: true },
                { width: 80, align: "right" },
                { width: 110, badge: true },
                { width: 100, badge: true },
                { width: 70, align: "right" },
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
          defaultClassId={classId}
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
