"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, StatCard } from "@corelithzw/react";

import { DataTable } from "@corelithzw/ui/components/data-table";
import { NumericCell } from "@corelithzw/ui/components/numeric-cell";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsSubjects,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";
import { GoalTargetDialog, type GoalTargetValues } from "./goal-target-dialog";

type GoalRow = {
  studentId: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  classId: string | null;
  className: string | null;
  streamName: string | null;
  subject: { id: string; code: string; name: string } | null;
  /** Null means nobody has set this child a target — the row that matters. */
  goalId: string | null;
  targetMark: number | null;
  baselineMark: number | null;
  currentMark: number | null;
  onTrack: boolean | null;
  achievedAt: string | null;
  plan: string | null;
  teacherNote: string | null;
};

type GoalsOversightResponse = {
  termId: string;
  rows: GoalRow[];
  summary: {
    onRoll: number;
    withGoal: number;
    withoutGoal: number;
    onTrack: number;
    goals: number;
  };
};

const STANDING_OPTIONS = [
  { value: "MISSING", label: "No target set" },
  { value: "ON_TRACK", label: "At or above target" },
  { value: "BEHIND", label: "Below target" },
  { value: "NO_MARK", label: "Target set, no mark yet" },
];

function percent(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}%`;
}

/** Where one row stands, drawn only from what the data actually supports. */
function standingOf(row: GoalRow) {
  if (row.goalId === null) return "MISSING";
  if (row.onTrack === true) return "ON_TRACK";
  if (row.onTrack === false) return "BEHIND";
  return "NO_MARK";
}

function standingBadge(row: GoalRow) {
  const standing = standingOf(row);
  if (standing === "MISSING") return <Badge tone="danger">No target</Badge>;
  if (standing === "ON_TRACK") return <Badge tone="success">At target</Badge>;
  if (standing === "BEHIND") return <Badge tone="warn">Below target</Badge>;
  // A missing mark says nothing about how the goal is going, so it is not a
  // warning. Reading it as "behind" would put a child on a chase list over a
  // test nobody has marked.
  return <Badge tone="neutral">No mark yet</Badge>;
}

/** What one bulk run has to write, so the mutation is not holding row objects. */
type BulkWrite = { studentId: string; label: string };

/**
 * Who is aiming at what, and — the point of the screen — who has been missed.
 *
 * A goals list built from the goals table can only show the children somebody
 * has already thought about. The head's question is the other one: which
 * pupils have no target at all. So the rows start from the roll and a pupil
 * with nothing set is a row saying so, in the same way the homework board
 * counts against the class list rather than against the submissions.
 *
 * With a subject chosen the gap narrows honestly to pupils in classes that
 * actually take it this term. A Form 1 pupil is not "missing" an A-level
 * Biology target, and a to-do list with invented entries on it is one nobody
 * will work through.
 *
 * Naming the gap was as far as it went, though, and a list of two hundred and
 * thirty-eight children nobody has set anything for is a reproach rather than
 * work unless you can act on it where you read it. So the verb lives on the
 * row, and once over the filtered set — narrow to Form 2A with no target, set
 * them all a Mathematics target in one pass, move on to Form 2B.
 *
 * ── The filter row ─────────────────────────────────────────────────────────
 *
 * Four filters, and the canvas names each with its unnarrowed choice:
 *
 *   Term = This term
 *   Year group = Every year
 *   Subject = Every subject
 *   Standing = Everyone
 *
 * Term, year group and subject are asked of the endpoint, because the roll the
 * rows are built from is the server's; standing is worked out per row from what
 * came back, so it is filtered here.
 */
export function GoalsOversightContent() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [standing, setStanding] = useState("");

  /** The row being written, or `"bulk"` for the whole filtered set. */
  const [editing, setEditing] = useState<GoalRow | "bulk" | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [written, setWritten] = useState(0);

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "goals-oversight"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "grades", "goals-oversight"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects", "goals-oversight"],
    queryFn: () => fetchSchoolsSubjects({ page: 1, limit: 200 }),
  });

  const query = useQuery({
    queryKey: ["schools", "goals", "oversight", termId, classId, subjectId],
    queryFn: () =>
      fetchJson<GoalsOversightResponse>(
        `/api/v2/schools/goals/oversight?${new URLSearchParams({
          ...(termId ? { termId } : {}),
          ...(classId ? { classId } : {}),
          ...(subjectId ? { subjectId } : {}),
        }).toString()}`,
      ),
  });

  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);
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
    () => subjects.map((row) => ({ value: row.id, label: row.name })),
    [subjects],
  );

  const summary = query.data?.summary;
  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    if (!standing) return all;
    return all.filter((row) => standingOf(row) === standing);
  }, [query.data, standing]);

  /**
   * The set a bulk run writes to: the rows on screen that still have nothing.
   *
   * Never the rows that already have a target. "Set targets for the 238" that
   * quietly restated four hundred existing ones would be a mass edit wearing a
   * create button's label, and the undo for it is a term's worth of typing.
   */
  const missing = useMemo(() => rows.filter((row) => row.goalId === null), [rows]);

  const narrowing = [
    classOptions.find((option) => option.value === classId)?.label,
    subjectOptions.find((option) => option.value === subjectId)?.label,
    STANDING_OPTIONS.find((option) => option.value === standing)?.label,
  ].filter((label): label is string => Boolean(label));

  const clearFilters = () => {
    setClassId("");
    setSubjectId("");
    setStanding("");
  };

  const setTargets = useMutation({
    mutationFn: async (input: { values: GoalTargetValues; writes: BulkWrite[] }) => {
      setWritten(0);
      // One at a time rather than `Promise.all`: two hundred simultaneous
      // upserts against the same table is how a shared database gets a lock
      // timeout, and a half-written run with no count is worse than a slow one.
      for (const write of input.writes) {
        await fetchJson("/api/v2/schools/goals", {
          method: "POST",
          body: JSON.stringify({
            studentId: write.studentId,
            ...(query.data?.termId ? { termId: query.data.termId } : {}),
            subjectId: input.values.subjectId,
            targetMark: input.values.targetMark,
            baselineMark: input.values.baselineMark,
            plan: input.values.plan.trim() || null,
            teacherNote: input.values.teacherNote.trim() || null,
          }),
        });
        setWritten((count) => count + 1);
      }
      return input.writes;
    },
    onSuccess: (writes) => {
      setEditing(null);
      setSaved(
        writes.length === 1
          ? `${writes[0]!.label} has a target.`
          : `${writes.length} pupils now have a target.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "goals"] });
    },
  });

  const columns = useMemo<ColumnDef<GoalRow>[]>(
    () => [
      {
        id: "pupil",
        header: "Pupil",
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-2">
            <PersonAvatar
              firstName={row.original.firstName}
              lastName={row.original.lastName}
            />
            <div className="min-w-0">
              <div className="font-medium">
                {row.original.lastName}, {row.original.firstName}
              </div>
              <div className="text-xs text-muted-foreground">
                {row.original.studentNo}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "class",
        header: "Class",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.className ?? "Not placed"}
            {row.original.streamName ? ` · ${row.original.streamName}` : ""}
          </span>
        ),
      },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) => (
          <span className="text-sm">
            {row.original.subject?.name ?? "Every subject"}
          </span>
        ),
      },
      {
        id: "target",
        header: "Target",
        cell: ({ row }) =>
          row.original.goalId === null ? (
            <NumericCell className="text-[color:var(--tone-danger)]">
              Not set
            </NumericCell>
          ) : (
            <NumericCell>{percent(row.original.targetMark)}</NumericCell>
          ),
      },
      {
        id: "standing",
        header: "Now",
        cell: ({ row }) => (
          <NumericCell
            className={
              row.original.onTrack === true
                ? "text-[color:var(--tone-success)]"
                : row.original.onTrack === false
                  ? "text-[color:var(--tone-warn)]"
                  : undefined
            }
          >
            {percent(row.original.currentMark)}
          </NumericCell>
        ),
      },
      {
        id: "plan",
        header: "How they will get there",
        cell: ({ row }) => (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {row.original.plan ?? row.original.teacherNote ?? "—"}
          </span>
        ),
      },
      {
        id: "state",
        header: "State",
        cell: ({ row }) => standingBadge(row.original),
      },
      {
        id: "verbs",
        header: "",
        cell: ({ row }) => (
          <RecordActions
            resource="schools.students"
            verbs={[
              {
                // The label is the state of the row, not the state of the
                // button: "Edit" on a pupil with nothing set would ask
                // somebody to change a target that does not exist.
                label: row.original.goalId === null ? "Set a target" : "Edit",
                action: "edit",
                onSelect: () => {
                  setSaved(null);
                  setEditing(row.original);
                },
              },
            ]}
          />
        ),
      },
    ],
    [],
  );

  const bulkLabel = `Set targets for the ${missing.length}`;
  const canWrite = access.can("schools.students", "edit");

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          {
            label: "With a target",
            value: query.isPending ? "—" : (summary?.withGoal ?? 0),
            tone: "success",
          },
          {
            label: "With none",
            value: query.isPending ? "—" : (summary?.withoutGoal ?? 0),
            tone: (summary?.withoutGoal ?? 0) > 0 ? "danger" : "neutral",
          },
          {
            label: "At or above",
            value: query.isPending ? "—" : (summary?.onTrack ?? 0),
            tone: "brand",
          },
        ]}
        actions={
          <Button
            variant="primary"
            size="sm"
            disabled={!canWrite || missing.length === 0}
            title={
              !canWrite
                ? "This is the registrar to do."
                : missing.length === 0
                  ? "Every pupil in view already has a target."
                  : undefined
            }
            onClick={() => {
              setSaved(null);
              setEditing("bulk");
            }}
          >
            {bulkLabel}
          </Button>
        }
      />

      {query.error ? (
        <LoadError
          what="the targets"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {setTargets.error ? (
        <SaveError what="The target" error={setTargets.error} />
      ) : null}
      {saved && !setTargets.isPending ? (
        <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} />
      ) : null}

      {query.isPending ? (
        <StatsSkeleton count={3} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            label="Pupils with a target"
            value={summary?.withGoal ?? 0}
            footer={`of ${summary?.onRoll ?? 0} on the roll`}
          />
          <StatCard
            label="Pupils with none"
            value={summary?.withoutGoal ?? 0}
            tone="danger"
            footer="Nobody has set these children anything"
          />
          <StatCard
            label="At or above target"
            value={summary?.onTrack ?? 0}
            tone="success"
            footer="Counted only where there is a mark to compare"
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
          label="Standing"
          allLabel="Everyone"
          value={standing}
          options={STANDING_OPTIONS}
          onChange={setStanding}
        />
      </FilterBar>

      {query.isPending ? (
        <TableRowsSkeleton
          columns={[{ avatar: true, twoLine: true }, { width: 120 }, { width: 140 }, { width: 90 }, { width: 90 }, {}, { width: 110 }]}
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          searchPlaceholder="Search pupil, class or subject"
          searchSubmitLabel="Search"
          pagination={{ enabled: true }}
          exportConfig={{ enabled: true, title: "Subject targets", fileName: "subject-targets" }}
          rowGroup={(row) =>
            row.className
              ? { key: row.className, label: row.className }
              : { key: "unplaced", label: "Not placed in a class" }
          }
          emptyState={
            query.error ? (
              "Nothing to show while the targets cannot be loaded."
            ) : narrowing.length > 0 ? (
              <NothingMatched what="pupils" filters={narrowing} onClear={clearFilters} />
            ) : subjectId ? (
              <NothingYet
                title="No class takes that subject this term"
                body="There is nobody to have a target in it. Choose another subject, or add the assignment under Teachers."
              />
            ) : (
              <NothingYet
                title="Nobody is on the roll this term"
                body="Enrol pupils and every one of them becomes a row here, with or without a target."
              />
            )
          }
        />
      )}

      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Card title="The rows start from the roll">
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            A targets list built from the targets table can only show the children
            somebody has already thought about. The head&rsquo;s question is the other
            one — <strong>which pupils have no target at all</strong>{" "}
            {"— so a pupil with nothing set is a row saying so."}
          </p>
        </Card>

        <Card title="No mark is not behind">
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            A missing mark says nothing about how the target is going, so it is neutral
            rather than a warning. Reading it as &ldquo;behind&rdquo; would put a child on
            a chase list over a test nobody has marked.
          </p>
        </Card>

        <Card title="The missing half">
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            The screen&rsquo;s whole purpose is naming the{" "}
            {(summary?.withoutGoal ?? 0).toLocaleString()} pupils nobody has set a target
            for. <strong>Set a target</strong> on the row, and one over the filtered set,
            is what turns the list into work.
          </p>
        </Card>
      </div>

      {editing ? (
        <GoalTargetDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setEditing(null);
              setTargets.reset();
            }
          }}
          title={
            editing === "bulk"
              ? bulkLabel
              : editing.goalId === null
                ? `Set ${editing.firstName} a target`
                : `${editing.firstName} ${editing.lastName}'s target`
          }
          description={
            editing === "bulk"
              ? `Every pupil in view with nothing set gets this target. Pupils who already have one are left alone.${
                  narrowing.length > 0 ? ` In view: ${narrowing.join(", ")}.` : ""
                }`
              : "A subject, a number, and how they get there."
          }
          subjects={subjects}
          defaults={
            editing === "bulk"
              ? { subjectId }
              : {
                  subjectId: editing.subject?.id ?? subjectId,
                  targetMark: editing.targetMark,
                  baselineMark: editing.baselineMark,
                  plan: editing.plan ?? "",
                  teacherNote: editing.teacherNote ?? "",
                }
          }
          submitLabel={
            editing === "bulk"
              ? `Set ${missing.length} target${missing.length === 1 ? "" : "s"}`
              : editing.goalId === null
                ? "Set the target"
                : "Save the target"
          }
          isSubmitting={setTargets.isPending}
          error={setTargets.error ? getApiErrorMessage(setTargets.error) : null}
          progress={
            editing === "bulk" && setTargets.isPending
              ? `${written} of ${missing.length} written`
              : null
          }
          onSubmit={(values) =>
            setTargets.mutate({
              values,
              writes:
                editing === "bulk"
                  ? missing.map((row) => ({
                      studentId: row.studentId,
                      label: `${row.firstName} ${row.lastName}`,
                    }))
                  : [
                      {
                        studentId: editing.studentId,
                        label: `${editing.firstName} ${editing.lastName}`,
                      },
                    ],
            })
          }
        />
      ) : null}
    </div>
  );
}
