"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { fetchSchoolsClasses, fetchSchoolsSubjects, fetchSchoolsTerms } from "@/lib/schools/admin-v2";
import type { ResultSheetLike, ResultSheetStatus } from "@/lib/schools/results-v2";
import { fetchSchoolsResultsData } from "@/lib/schools/schools-v2";
import { SheetDetailDialog } from "@/components/schools/results/sheet-detail-dialog";
import { SheetFormDialog } from "@/components/schools/results/sheet-form-dialog";
import { PublishStateBadge, SheetStateBadge } from "@/components/schools/results/sheet-state";
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
 * The class name in each row is still the way into a year group, so nothing was
 * lost by dropping the picker.
 */

type OverviewView = "all" | "entering" | "review" | "queried" | "ready" | "published";

const VIEW_STATE: Record<OverviewView, ResultSheetStatus | undefined> = {
  all: undefined,
  entering: "DRAFT",
  review: "SUBMITTED",
  queried: "HOD_REJECTED",
  ready: "HOD_APPROVED",
  published: "PUBLISHED",
};

const VIEW_ORDER: OverviewView[] = [
  "all",
  "entering",
  "review",
  "queried",
  "ready",
  "published",
];

const VIEW_LABEL: Record<OverviewView, string> = {
  all: "All sheets",
  entering: "Entering",
  review: "In review",
  queried: "Queried",
  ready: "Ready",
  published: "Published",
};

export function ResultsOverviewContent() {
  const [view, setView] = useState<OverviewView>("all");
  const [termFilter, setTermFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [streamFilter, setStreamFilter] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("");
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
      VIEW_STATE[view] ?? "",
    ],
    queryFn: () =>
      fetchSchoolsResultsData({
        page: 1,
        limit: 100,
        termId: termFilter || undefined,
        classId: classFilter || undefined,
        streamId: streamFilter || undefined,
        status: VIEW_STATE[view],
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
    if (!subjectName) return sheets;
    const needle = subjectName.toLowerCase();
    return sheets.filter((sheet) => sheet.title.toLowerCase().includes(needle));
  }, [sheets, subjectName]);

  const activeTerm = terms.find((term) => term.isActive) ?? null;
  const termInView = termFilter
    ? (terms.find((term) => term.id === termFilter) ?? null)
    : activeTerm;

  const narrowing = [
    termFilter ? (termInView?.name ?? null) : null,
    classes.find((row) => row.id === classFilter)?.name ?? null,
    streams.find((row) => row.id === streamFilter)?.name ?? null,
    subjectName || null,
    view === "all" ? null : VIEW_LABEL[view],
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setTermFilter("");
    setClassFilter("");
    setStreamFilter("");
    setSubjectFilter("");
    setView("all");
  };

  const openForm = (sheet: ResultSheetLike | null) => {
    setFormFor(sheet);
    setFormOpen(true);
  };

  const columns = useMemo<ColumnDef<ResultSheetLike>[]>(
    () => [
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (
          <Link
            href={`/schools/results/class/${row.original.class.id}${row.original.stream ? `?streamId=${row.original.stream.id}` : ""}`}
            className="font-medium hover:underline"
          >
            {row.original.class.name}
            {row.original.stream ? ` ${row.original.stream.name}` : ""}
          </Link>
        ),
      },
      {
        id: "sheet",
        header: "Sheet",
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">{row.original.term.name}</div>
          </div>
        ),
      },
      {
        id: "entered",
        header: "Entered",
        cell: ({ row }) => (
          <NumericCell>
            {row.original.stats?.linesCount ?? row.original._count.lines}
          </NumericCell>
        ),
      },
      {
        id: "moderation",
        header: "Moderation",
        cell: ({ row }) => <SheetStateBadge status={row.original.status} />,
      },
      {
        id: "publish",
        header: "Publish",
        cell: ({ row }) => <PublishStateBadge status={row.original.status} />,
      },
      {
        id: "mean",
        header: "Mean",
        cell: ({ row }) => {
          const average = row.original.stats?.averageScore ?? null;
          return <NumericCell>{average === null ? "—" : average.toFixed(1)}</NumericCell>;
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.results"
            verbs={workflow.verbsFor(row.original, {
              onOpen: (sheet) => setOpenSheetId(sheet.id),
              onEdit: (sheet) => openForm(sheet),
            })}
          />
        ),
      },
    ],
    [workflow],
  );

  return (
    <div className="space-y-4">
      <PageHeading
        title="Results overview"
        description="Where every mark sheet has got to this term, and what is holding publishing up."
        primaryAction={
          <CreateButton
            resource="schools.results"
            label="New mark sheet"
            onSelect={() => openForm(null)}
          />
        }
      />

      <PageBand
        chips={[
          { label: "Sheets", value: summary?.totalSheets ?? 0 },
          { label: "Moderated", value: summary?.hodApprovedSheets ?? 0, tone: "success" },
          {
            label: "Queried",
            value: summary?.hodRejectedSheets ?? 0,
            tone: "danger",
            href: "/schools/results/moderation",
          },
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
          what="the result sheets"
          error={resultsQuery.error}
          onRetry={() => void resultsQuery.refetch()}
        />
      ) : null}

      <VerticalDataViews
        items={VIEW_ORDER.map((id) => ({
          id,
          label: VIEW_LABEL[id],
          count:
            id === "all"
              ? summary?.totalSheets
              : id === "entering"
                ? summary?.draftSheets
                : id === "review"
                  ? summary?.submittedSheets
                  : id === "queried"
                    ? summary?.hodRejectedSheets
                    : id === "ready"
                      ? summary?.hodApprovedSheets
                      : summary?.publishedSheets,
        }))}
        value={view}
        onValueChange={(next) => setView(next as OverviewView)}
        railLabel="Result sheets"
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
          </FilterBar>

          {/*
            A result sheet is the end-of-term collation, not one of the term's
            individual assessments — those live in the mark book and never reach
            moderation. Naming that in the card title is the difference between
            "here is everything with a mark on it" and "here is what goes on the
            report", which is the only list this screen is about.
          */}
          <Card
            flush
            title={`Result sheets${termInView ? ` — ${termInView.name}` : ""} end-of-term`}
            subtitle="Nothing publishes until moderation clears"
          >
            {resultsQuery.isLoading ? (
              <TableRowsSkeleton
                columns={[
                  { width: 110 },
                  { twoLine: true },
                  { width: 80 },
                  { width: 110 },
                  { width: 100 },
                  { width: 70 },
                ]}
              />
            ) : (
              <DataTable
                data={rows}
                columns={columns}
                edgeToEdge
                searchPlaceholder="Search class, subject or teacher"
                searchBehavior="instant"
                pagination={{ enabled: true }}
                exportConfig={{
                  enabled: true,
                  title: `Result sheets${termInView ? ` — ${termInView.name}` : ""} end-of-term`,
                  fileName: "result-sheets",
                }}
                emptyState={
                  sheets.length === 0 && narrowing.length === 0 ? (
                    <NothingYet
                      title="No mark sheets this term"
                      body="A sheet appears here once a class's mark book has been written to it, or when somebody raises one by hand."
                    />
                  ) : (
                    <NothingMatched what="sheets" filters={narrowing} onClear={clearFilters} />
                  )
                }
              />
            )}
          </Card>
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
    </div>
  );
}
