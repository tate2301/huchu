"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { Badge, Card, StatCard } from "@corelithzw/react";

import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsSubjects,
  fetchSchoolsTerms,
  fetchTeacherProfiles,
} from "@/lib/schools/admin-v2";
import { AssignmentBoardDialog } from "./assignment-board-dialog";

/** Kept in step with `AssignmentState` in `lib/schools/assignments.ts`. */
type AssignmentState = "DRAFT" | "SET" | "DUE_WEEK" | "OVERDUE";

type OversightRow = {
  id: string;
  title: string;
  dueAt: string | null;
  setOn: string;
  isPublished: boolean;
  classId: string;
  className: string;
  streamName: string | null;
  subjectId: string;
  subjectName: string;
  teacherProfileId: string;
  teacherName: string | null;
  onRoll: number;
  handedIn: number;
  late: number;
  marked: number;
  state: AssignmentState;
};

type OversightResponse = {
  termId: string;
  rows: OversightRow[];
  summary: {
    open: number;
    dueThisWeek: number;
    overdue: number;
    onRoll: number;
    handedIn: number;
  };
  week: { from: string; to: string };
};

const STATE_OPTIONS = [
  { value: "SET", label: "Set and running" },
  { value: "DUE_WEEK", label: "Due this week" },
  { value: "OVERDUE", label: "Overdue" },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

function stateBadge(state: AssignmentState) {
  if (state === "OVERDUE") return <Badge tone="danger">Overdue</Badge>;
  if (state === "DUE_WEEK") return <Badge tone="warn">Due this week</Badge>;
  if (state === "DRAFT") return <Badge tone="neutral">Not set yet</Badge>;
  return <Badge tone="success">Running</Badge>;
}

/**
 * What the whole school has been set, and what has come back.
 *
 * A teacher already sees their own homework and a child sees their own; nobody
 * could see across classes, so "which class is drowning this week" had no
 * answer anywhere in the product. The column that answers it is handed-in *of
 * the roll* — 4 of 32 and 4 of 5 are the same submission count and completely
 * different Tuesdays — which is why the roll travels with every row rather
 * than a bare tally of what arrived.
 *
 * The tiles count the term-and-filter scope, not the state filter below them:
 * a head reads "6 overdue", then narrows the table to see which six. Narrowing
 * the tiles too would leave every tile reading its own filter back at itself.
 *
 * Every row used to end there. Opening one now shows who has not handed in and
 * offers the one send that reaches those families — because a deputy who spots
 * "4 of 31" and cannot find out which twenty-seven is being shown a problem
 * and denied the work.
 */
export function HomeworkOversightContent() {
  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [teacherProfileId, setTeacherProfileId] = useState("");
  const [state, setState] = useState("");
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "homework-oversight"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "grades", "homework-oversight"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects", "homework-oversight"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });
  const teachersQuery = useQuery({
    queryKey: ["schools", "teacher-profiles", "homework-oversight"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200, isActive: true }),
  });

  const query = useQuery({
    queryKey: [
      "schools",
      "homework",
      "oversight",
      termId,
      classId,
      subjectId,
      teacherProfileId,
    ],
    queryFn: () =>
      fetchJson<OversightResponse>(
        `/api/v2/schools/assignments/oversight?${new URLSearchParams({
          ...(termId ? { termId } : {}),
          ...(classId ? { classId } : {}),
          ...(subjectId ? { subjectId } : {}),
          ...(teacherProfileId ? { teacherProfileId } : {}),
        }).toString()}`,
      ),
  });

  const termOptions = useMemo(
    () =>
      (termsQuery.data?.data ?? []).map((term) => ({
        value: term.id,
        label: `${term.name} · ${term.academicYear.name}`,
      })),
    [termsQuery.data],
  );
  const classOptions = useMemo(
    () =>
      (classesQuery.data?.data ?? []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
    [classesQuery.data],
  );
  const subjectOptions = useMemo(
    () =>
      (subjectsQuery.data?.data ?? []).map((row) => ({
        value: row.id,
        label: row.name,
      })),
    [subjectsQuery.data],
  );
  const teacherOptions = useMemo(
    () =>
      (teachersQuery.data?.data ?? []).map((row) => ({
        value: row.id,
        label: row.user.name,
      })),
    [teachersQuery.data],
  );

  const summary = query.data?.summary;
  const allRows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const rows = useMemo(() => {
    if (!state) return allRows;
    // "Set and running" holds the drafts back: a head asking what is set means
    // what the children can see.
    return allRows.filter((row) => row.state === state);
  }, [allRows, state]);

  /**
   * Which class is drowning: how much has been set this week, per class.
   *
   * Counted off the term-and-filter rows rather than the state-filtered ones,
   * for the same reason the tiles are — the panel exists to point at the class
   * to look at next, and a panel that only ever names the class already
   * selected has stopped answering anything.
   */
  const setThisWeek = useMemo(() => {
    const week = query.data?.week;
    if (!week) return [];
    const from = new Date(week.from).getTime();
    const to = new Date(week.to).getTime();
    const byClass = new Map<string, { className: string; count: number }>();
    for (const row of allRows) {
      const setOn = new Date(row.setOn).getTime();
      if (Number.isNaN(setOn) || setOn < from || setOn >= to) continue;
      const entry = byClass.get(row.classId) ?? { className: row.className, count: 0 };
      entry.count += 1;
      byClass.set(row.classId, entry);
    }
    return [...byClass.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  }, [allRows, query.data]);

  const busiest = setThisWeek[0]?.count ?? 0;

  const narrowing = [
    classOptions.find((option) => option.value === classId)?.label,
    subjectOptions.find((option) => option.value === subjectId)?.label,
    teacherOptions.find((option) => option.value === teacherProfileId)?.label,
    STATE_OPTIONS.find((option) => option.value === state)?.label,
  ].filter((label): label is string => Boolean(label));

  const clearFilters = () => {
    setClassId("");
    setSubjectId("");
    setTeacherProfileId("");
    setState("");
  };

  const columns = useMemo<ColumnDef<OversightRow>[]>(
    () => [
      {
        id: "subject",
        header: "Subject and class",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.subjectName}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.className}
              {row.original.streamName ? ` · ${row.original.streamName}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "title",
        header: "Homework",
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.title}</div>
            <div className="text-xs text-muted-foreground">
              {row.original.marked > 0
                ? `${row.original.marked} marked`
                : "Nothing marked yet"}
              {row.original.late > 0 ? ` · ${row.original.late} in late` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "teacher",
        header: "Teacher",
        cell: ({ row }) => (
          <span className="text-sm">{row.original.teacherName ?? "Unassigned"}</span>
        ),
      },
      {
        id: "setOn",
        header: "Set",
        cell: ({ row }) => <NumericCell>{formatDate(row.original.setOn)}</NumericCell>,
      },
      {
        id: "dueAt",
        header: "Due",
        cell: ({ row }) => (
          <NumericCell
            className={
              row.original.state === "OVERDUE"
                ? "font-semibold text-[color:var(--tone-danger)]"
                : undefined
            }
          >
            {row.original.dueAt ? formatDate(row.original.dueAt) : "No deadline"}
          </NumericCell>
        ),
      },
      {
        id: "handedIn",
        header: "Handed in",
        cell: ({ row }) => {
          const { handedIn, onRoll, state: rowState } = row.original;
          // Colour only where it means something: a class past its deadline
          // with work still missing. Everything else stays plain, so the red
          // in the column is a shortlist rather than decoration.
          const tone =
            rowState === "OVERDUE"
              ? "text-[color:var(--tone-danger)]"
              : onRoll > 0 && handedIn >= onRoll
                ? "text-[color:var(--tone-success)]"
                : undefined;
          return (
            <NumericCell className={tone}>
              {handedIn} of {onRoll}
            </NumericCell>
          );
        },
      },
      {
        id: "state",
        header: "State",
        cell: ({ row }) => stateBadge(row.original.state),
      },
      {
        id: "verbs",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.academics"
            verbs={[
              {
                label: "Who has not handed in",
                // Reading a class list is a `view`, not an edit — a deputy who
                // may not set homework still has to be able to chase it.
                action: "view",
                onSelect: () => setOpenAssignmentId(row.original.id),
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          {
            label: "Set and running",
            value: query.isPending ? "—" : (summary?.open ?? 0),
            tone: "success",
          },
          {
            label: "Due this week",
            value: query.isPending ? "—" : (summary?.dueThisWeek ?? 0),
            tone: "warn",
          },
          {
            label: "Overdue",
            value: query.isPending ? "—" : (summary?.overdue ?? 0),
            tone: (summary?.overdue ?? 0) > 0 ? "danger" : "neutral",
          },
        ]}
      />

      {query.error ? (
        <LoadError
          what="the homework"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.isPending ? (
        <StatsSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Set and running"
            value={summary?.open ?? 0}
            footer="Published, deadline not yet passed"
          />
          <StatCard
            label="Due this week"
            value={summary?.dueThisWeek ?? 0}
            tone="warn"
            footer="Monday to Sunday"
          />
          <StatCard
            label="Overdue"
            value={summary?.overdue ?? 0}
            tone="danger"
            footer="Past the deadline with work still missing"
          />
        </div>
      )}

      <FilterBar>
        <FilterSelect
          label="Term"
          allLabel="This term"
          value={termId}
          options={termOptions}
          onChange={setTermId}
        />
        <FilterSelect
          label="Year group"
          allLabel="Every year"
          value={classId}
          options={classOptions}
          onChange={setClassId}
        />
        <FilterSelect
          label="Subject"
          allLabel="Every subject"
          value={subjectId}
          options={subjectOptions}
          onChange={setSubjectId}
        />
        <FilterSelect
          label="Teacher"
          allLabel="Every teacher"
          value={teacherProfileId}
          options={teacherOptions}
          onChange={setTeacherProfileId}
        />
        <FilterSelect
          label="State"
          allLabel="Anything set"
          value={state}
          options={STATE_OPTIONS}
          onChange={setState}
        />
      </FilterBar>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          {query.isPending ? (
            <TableRowsSkeleton
              columns={[
                { twoLine: true },
                { twoLine: true },
                { width: 120 },
                { width: 90 },
                { width: 90 },
                { width: 90 },
                { width: 110 },
              ]}
            />
          ) : (
            <DataTable
              data={rows}
              columns={columns}
              searchPlaceholder="Search homework, subject or teacher"
              searchSubmitLabel="Search"
              pagination={{ enabled: true }}
              exportConfig={{ enabled: true, title: "Homework", fileName: "homework" }}
              emptyState={
                query.error ? (
                  "Nothing to show while the homework cannot be loaded."
                ) : narrowing.length > 0 ? (
                  <NothingMatched
                    what="homework"
                    filters={narrowing}
                    onClear={clearFilters}
                  />
                ) : (
                  <NothingYet
                    title="No homework has been set this term"
                    body="Anything a teacher sets appears here with the class roll beside it."
                  />
                )
              }
            />
          )}
        </div>

        <Card
          title="Which class is drowning"
          subtitle="Pieces set this week"
          className="h-fit"
        >
          {setThisWeek.length === 0 ? (
            <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
              Nothing has been set this week yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {setThisWeek.map((entry) => (
                <li key={entry.className} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[length:var(--type-body-sm)] text-[color:var(--text-body)]">
                      {entry.className}
                    </span>
                    <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] font-bold tabular-nums text-[color:var(--text-strong)]">
                      {entry.count}
                    </span>
                  </div>
                  {/* A bar against the busiest class rather than against the
                      roll: the question is relative — who is being given more
                      than everybody else this week. */}
                  <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-muted)]">
                    <div
                      className="h-full rounded-full bg-[color:var(--brand)]"
                      style={{
                        width: `${busiest > 0 ? Math.round((entry.count / busiest) * 100) : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {openAssignmentId ? (
        <AssignmentBoardDialog
          open
          onOpenChange={(next) => {
            if (!next) setOpenAssignmentId(null);
          }}
          assignmentId={openAssignmentId}
        />
      ) : null}
    </div>
  );
}
