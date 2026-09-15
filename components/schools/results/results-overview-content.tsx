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
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import type { ResultSheetLike, ResultSheetStatus } from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import { ResultsViews } from "@/components/schools/results/results-views";
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
  SHEET_STATE_ORDER,
} from "@/components/schools/results/sheet-state";
import { useResultSheetWorkflow } from "@/components/schools/results/use-sheet-workflow";

/**
 * The state of the term, in one screen.
 *
 * This route was a grid of year-group cards — a picker standing in for a page,
 * which answered "which class?" when the question anybody opening Results has
 * is "what is still outstanding, and can we publish yet?". The rail down the
 * side is that question's five answers, and it doubles as the state filter:
 * putting a "State" dropdown beside it would be two controls fighting over one
 * value, so the rail *is* that control and the dropdowns narrow within it.
 *
 * The rail is named in the five words `sheet-state.tsx` owns — Draft,
 * Submitted, Sent back, Approved, Published — rather than in a second set
 * invented for this screen. It used to say Entering, In review, Queried,
 * Ready: five more words for the five states the badge in the row beside them
 * was already naming, so the rail and the table disagreed about what a sheet
 * was called at the moment the reader was comparing them.
 *
 * The class name in each row is still the way into a year group, so nothing was
 * lost by dropping the picker.
 */

type OverviewView = "all" | ResultSheetStatus;

const VIEW_ORDER: OverviewView[] = ["all", ...SHEET_STATE_ORDER];

function viewLabel(view: OverviewView) {
  return view === "all" ? "All sheets" : SHEET_STATE_LABELS[view];
}

export function ResultsOverviewContent() {
  const [view, setView] = useState<OverviewView>("all");
  const [termFilter, setTermFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [search, setSearch] = useState("");
  const [formFor, setFormFor] = useState<ResultSheetLike | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [openSheetId, setOpenSheetId] = useState<string | null>(null);

  const workflow = useResultSheetWorkflow();

  const termsQuery = useQuery({
    queryKey: ["schools", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 100 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 100, isActive: true }),
  });

  const resultsQuery = useQuery({
    queryKey: [
      "schools",
      "results",
      "overview",
      termFilter,
      classFilter,
      streamFilter,
      view,
    ],
    queryFn: () =>
      fetchSchoolsResultsData({
        page: 1,
        limit: 100,
        termId: termFilter || undefined,
        classId: classFilter || undefined,
        streamId: streamFilter || undefined,
        status: view === "all" ? undefined : view,
      }),
  });

  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
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

  // A sheet carries no subject of its own — the marks under it do, one subject
  // code per line — so the only honest subject filter at this level is the name
  // the sheet is called by. It is what a head of department reads the list by
  // anyway: "Mathematics — end of term".
  const subjectName = useMemo(
    () => subjects.find((subject) => subject.id === subjectFilter)?.name ?? "",
    [subjects, subjectFilter],
  );
  const rows = useMemo(() => {
    const subjectNeedle = subjectName.toLowerCase();
    const typed = search.trim().toLowerCase();
    return sheets.filter((sheet) => {
      if (subjectNeedle && !sheet.title.toLowerCase().includes(subjectNeedle)) return false;
      if (!typed) return true;
      return `${sheet.title} ${sheetClassName(sheet)} ${sheet.term.name}`
        .toLowerCase()
        .includes(typed);
    });
  }, [sheets, subjectName, search]);

  const activeTerm = terms.find((term) => term.isActive) ?? null;
  const termInView = termFilter
    ? (terms.find((term) => term.id === termFilter) ?? null)
    : activeTerm;

  const narrowing = [
    termFilter ? (termInView?.name ?? null) : null,
    classes.find((row) => row.id === classFilter)?.name ?? null,
    streams.find((row) => row.id === streamFilter)?.name ?? null,
    subjectName || null,
    view === "all" ? null : viewLabel(view),
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setTermFilter("");
    setClassFilter("");
    setStreamFilter("");
    setSubjectFilter("");
    setSearch("");
    setView("all");
  };

  const openForm = (sheet: ResultSheetLike | null) => {
    setFormFor(sheet);
    setFormOpen(true);
  };

  const columns = useMemo(
    () => [
      sheetColumn(),
      linesColumn("Entered"),
      moderationColumn(),
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

  const nothingAtAll =
    !resultsQuery.isLoading && sheets.length === 0 && narrowing.length === 0 && !search.trim();

  const emptyState = nothingAtAll ? (
    <NothingYet
      title="No mark sheets this term"
      body="A sheet appears here once a class's mark book has been written to it, or when somebody raises one by hand."
    />
  ) : (
    <NothingMatched
      what="sheets"
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
            { label: "Sheets", value: summary?.totalSheets ?? "—" },
            { label: "Approved", value: summary?.hodApprovedSheets ?? "—", tone: "success" },
            {
              label: "Sent back",
              value: summary?.hodRejectedSheets ?? "—",
              tone: "danger",
              href: "/schools/results/moderation",
            },
            {
              label: "Published",
              value: summary?.publishedSheets ?? "—",
              tone: "brand",
              href: "/schools/results/publish",
            },
          ]}
        />
      }
    >
      <PageChrome title="Results">
        <CreateButton
          resource="schools.results"
          label="New mark sheet"
          onSelect={() => openForm(null)}
        />
      </PageChrome>

      {workflow.error ? <SaveError what="That sheet" error={workflow.error} /> : null}
      {resultsQuery.error ? (
        <LoadError
          what="the result sheets"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}

      <VerticalDataViews
        items={VIEW_ORDER.map((id) => ({
          id,
          label: viewLabel(id),
          count:
            id === "all"
              ? summary?.totalSheets
              : id === "DRAFT"
                ? summary?.draftSheets
                : id === "SUBMITTED"
                  ? summary?.submittedSheets
                  : id === "HOD_REJECTED"
                    ? summary?.hodRejectedSheets
                    : id === "HOD_APPROVED"
                      ? summary?.hodApprovedSheets
                      : summary?.publishedSheets,
        }))}
        value={view}
        onValueChange={(next) => setView(next as OverviewView)}
        railLabel="Sheet state"
      >
        <div className="space-y-2">
          {/* One row, read left to right: whose sheets, then how they are
              narrowed, then how many are left. The state rail beside it is a
              different axis and does not belong in here — but its choice is
              named in the empty state's sentence, because a rail sitting on
              "Sent back" is exactly as capable of emptying the table as a
              dropdown is. */}
          <TableControls
            sticky
            tabs={<ResultsViews school={summary?.totalSheets} />}
            search={
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search sheet, class or term"
              />
            }
            filterCount={activeFilterCount(classFilter, streamFilter, subjectFilter, termFilter)}
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
              </>
            }
            // Beside the narrowing rather than in the band: it is the answer to
            // whatever the filters just asked, so it moves when they move.
            count={resultsQuery.isLoading ? null : `${rows.length} of ${sheets.length}`}
            actions={
              narrowing.length > 0 || search.trim() ? (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear the filters
                </Button>
              ) : null
            }
          />

          <DataTable
            data={rows}
            columns={columns}
            features={{ globalFilter: false }}
            pagination={{ enabled: true }}
            exportConfig={{
              enabled: true,
              title: `Result sheets${termInView ? ` — ${termInView.name}` : ""}`,
              fileName: "result-sheets",
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
                  headers={["Sheet", "Entered", "Moderation", "Publish", "Mean", ""]}
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
        </div>
      </VerticalDataViews>

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
