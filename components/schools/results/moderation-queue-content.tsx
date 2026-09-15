"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageChrome } from "@/components/layout/page-chrome";
import { PageBand } from "@/components/schools/common/page-band";
import { activeFilterCount, FilterSelect } from "@/components/schools/common/filter-select";
import { SchoolsPage } from "@/components/schools/common/schools-page";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  NotYourJob,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { VerticalDataViews } from "@/components/ui/vertical-data-views";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import type { ResultSheetLike, ResultSheetStatus } from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import {
  SheetMobileList,
  averageColumn,
  linesColumn,
  moderationColumn,
  sheetActionsColumn,
  sheetClassName,
  sheetColumn,
  waitingColumn,
} from "@/components/schools/results/sheet-columns";
import { SheetDetailDialog } from "@/components/schools/results/sheet-detail-dialog";
import { SheetFormDialog } from "@/components/schools/results/sheet-form-dialog";
import {
  SHEET_STATE_LABELS,
  SHEET_STATE_OPTIONS,
  waitingMs,
} from "@/components/schools/results/sheet-state";
import { useResultSheetWorkflow } from "@/components/schools/results/use-sheet-workflow";

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
  const access = useSchoolAccess();
  const [view, setView] = useState<QueueView>("queue");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [search, setSearch] = useState("");
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

  // One clock for the render, the way the office inbox does it. Read per row, a
  // queue sorted across a tick compares two sheets against two different
  // instants.
  const now = new Date().getTime();

  const queueRows = useMemo(
    () =>
      filtered
        .filter((sheet) => sheet.status === "SUBMITTED" || sheet.status === "HOD_REJECTED")
        .sort((a, b) => waitingMs(waitingSince(b), now) - waitingMs(waitingSince(a), now)),
    [filtered, now],
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
    setSearch("");
  };

  const columns = useMemo(
    () => [
      waitingColumn(waitingSince, now),
      sheetColumn(),
      moderationColumn("State"),
      linesColumn(),
      averageColumn(),
      sheetActionsColumn({
        workflow,
        onOpen: (sheet) => setOpenSheetId(sheet.id),
        onEdit: (sheet) => setFormFor(sheet),
      }),
    ],
    [workflow, now],
  );

  const rows = view === "queue" ? queueRows : allRows;

  // Approving and sending back are the head of department's grants, and they
  // are the only reason this screen exists — so whether the person reading it
  // holds them decides whether the screen is a queue or a window onto one.
  const canModerate =
    access.can("schools.results", "approve") ||
    access.can("schools.results", "moderate");

  const narrowed = narrowing.length > 0 || Boolean(search.trim());

  const emptyState = narrowed ? (
    <NothingMatched
      what="sheets"
      filters={narrowing}
      search={search}
      onClear={clearFilters}
    />
  ) : view === "queue" ? (
    <NothingLeftToDo
      title="Nothing waiting on moderation"
      body="Every sheet handed in has been dealt with. New ones appear the moment a teacher submits."
    />
  ) : (
    /*
      An empty queue is good news; an empty school is not the same sentence.
      "All sheets" with nothing in it means no class has written marks to a
      sheet yet, which is a school on its first day rather than a cleared desk.
    */
    <NothingYet
      title="No result sheets yet"
      body="Sheets appear here once a class's marks have been written to one, from that year group's assessments."
    />
  );

  return (
    <SchoolsPage
      band={
        /*
          The band on this screen carries the whole term's state, not just the
          queue's own: a head of department deciding whether to sign one more
          sheet off tonight needs to know a window is already open (so
          approving releases marks this evening) or that every window is shut
          (so it can wait until morning). The five sheet states and the three
          window states, in the order a sheet travels.
        */
        <PageBand
          chips={[
            { label: "Draft", value: summary?.draftSheets ?? "—" },
            { label: "Submitted", value: summary?.submittedSheets ?? "—", tone: "warn" },
            { label: "Sent back", value: summary?.hodRejectedSheets ?? "—", tone: "danger" },
            { label: "Approved", value: summary?.hodApprovedSheets ?? "—", tone: "success" },
            {
              label: "Published",
              value: summary?.publishedSheets ?? "—",
              tone: "brand",
              href: "/schools/results/publish",
            },
            {
              label: "Windows open",
              value: summary?.openPublishWindows ?? "—",
              tone: "success",
              href: "/schools/results/publish",
            },
            {
              label: "Windows scheduled",
              value: summary?.scheduledPublishWindows ?? "—",
              href: "/schools/results/publish",
            },
            {
              label: "Windows closed",
              value: summary?.closedPublishWindows ?? "—",
              href: "/schools/results/publish",
            },
          ]}
        />
      }
    >
      <PageChrome title="Moderation" />

      {/*
        A bursar or a subject teacher can read the queue all day; approving and
        sending back belong to the head of department for the subject.
        `RecordActions` already disables each verb with the reason on it, but a
        menu of dead verbs never says why the whole screen is read-only — so the
        screen says it once, at the top, and names who to ask.
      */}
      {canModerate ? null : (
        <NotYourJob action="approve" resource="schools.results" what="A mark sheet" />
      )}

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
          { id: "queue", label: "Waiting on you", count: queueRows.length },
          { id: "all", label: "All sheets", count: allRows.length },
        ]}
        value={view}
        onValueChange={(next) => setView(next as QueueView)}
        railLabel="Moderation views"
      >
        <div className="space-y-2">
          <TableControls
            sticky
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
            count={resultsQuery.isLoading ? null : `${rows.length} of ${sheets.length}`}
            actions={
              narrowed ? (
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
              title: "Moderation queue",
              fileName: "moderation-queue",
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
                  headers={["Waiting", "Sheet", "State", "Marks", "Mean", ""]}
                  columns={[
                    { width: 100, twoLine: true },
                    { avatar: true, twoLine: true },
                    { width: 110, badge: true },
                    { width: 70, align: "right" },
                    { width: 80, align: "right" },
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
    </SchoolsPage>
  );
}
