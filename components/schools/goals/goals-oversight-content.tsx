"use client";

import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button } from "@corelithzw/react";

import { MobileList, MobileListEmpty } from "@corelithzw/react";

import { EntityLink } from "@/components/records/entity-link";
import { PageChrome } from "@/components/layout/page-chrome";
import { RecordCell, recordCellTone } from "@/components/records/record-table";
import { RecordMark } from "@/components/records/record-mark";
import { DataTable } from "@/components/ui/data-table";
import { NumericCell } from "@/components/ui/numeric-cell";
import {
  activeFilterCount,
  FilterSelect,
} from "@/components/schools/common/filter-select";
import { TableControls, TableSearch } from "@/components/records/table-controls";
import { PersonCell } from "@/components/schools/common/identity-cell";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/records/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { recordType } from "@/lib/records/registry";
import {
  fetchSchoolsClasses,
  fetchSchoolsSubjects,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";
import { updateStudentGoal } from "@/lib/schools/goals-v2";
import { GoalTargetDialog, type GoalTargetValues } from "./goal-target-dialog";
import { useClassVocabulary } from "@/components/schools/common/use-class-vocabulary";

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
 * The same verb on a row that already has one corrects it, which is the other
 * half of the screen's job: it is here that a department compares achievement
 * against the target, and a target that came out of a moderation wrong is the
 * thing the comparison is being read against.
 *
 * ── The narrowing row ──────────────────────────────────────────────────────
 *
 * Four filters, and the canvas names each with its unnarrowed choice:
 *
 *   Term = This term
 *   Class = Every year
 *   Subject = Every subject
 *   Standing = Everyone
 *
 * Term, class and subject are asked of the endpoint, because the roll the
 * rows are built from is the server's; standing is worked out per row from what
 * came back, so it is filtered here. The search box matches here too, for the
 * same reason: what it looks through is the roll already in hand.
 *
 * All five sit in one row above the table with the count, where every other
 * campus list puts them. The filters used to sit in a bar of their own and the
 * search box inside the table's own toolbar, so "narrow it down" was answered
 * in two places — and on a phone neither of them folded away or said how many
 * filters were in force, which is how a list ends up looking empty for no
 * visible reason.
 */
export function GoalsOversightContent() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();

  const [termId, setTermId] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [standing, setStanding] = useState("");
  const [search, setSearch] = useState("");

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

  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    const typed = search.trim().toLowerCase();
    return all.filter((row) => {
      if (standing && standingOf(row) !== standing) return false;
      if (!typed) return true;
      // The pupil, the class and the subject — the three the box names, plus
      // the admission number, which is what the office has in front of it when
      // it is not sure how a name is spelled.
      return [
        `${row.firstName} ${row.lastName}`,
        row.studentNo,
        row.className,
        row.streamName,
        row.subject?.name,
      ].some((field) => field?.toLowerCase().includes(typed));
    });
  }, [query.data, search, standing]);

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
    setSearch("");
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

  /**
   * Correcting a target that is already there, which is a different verb.
   *
   * The row's "Edit" used to go back through the same POST, and POST is keyed on
   * pupil, term and subject. Change the number and it worked by luck; change the
   * subject — the usual reason anyone opens an existing target, because it was
   * recorded against Geography and meant Mathematics — and the school ended up
   * with two, the wrong one still sitting on the board. This addresses the goal
   * by its id, so a moderation moves it instead of copying it.
   */
  const reviseTarget = useMutation({
    mutationFn: (input: { goalId: string; label: string; values: GoalTargetValues }) =>
      updateStudentGoal({
        id: input.goalId,
        subjectId: input.values.subjectId,
        targetMark: input.values.targetMark,
        baselineMark: input.values.baselineMark,
        // An emptied box means clear the column, not leave it — the endpoint
        // keeps the two apart and so must the form.
        plan: input.values.plan.trim() || null,
        teacherNote: input.values.teacherNote.trim() || null,
      }),
    onSuccess: (_written, input) => {
      setEditing(null);
      setSaved(`${input.label}'s target has been changed.`);
      void queryClient.invalidateQueries({ queryKey: ["schools", "goals"] });
    },
  });

  /** True while the open dialog is correcting a target rather than setting one. */
  const revising = editing !== null && editing !== "bulk" && editing.goalId !== null;
  const writeError = setTargets.error ?? reviseTarget.error;
  const isWriting = setTargets.isPending || reviseTarget.isPending;

  const words = useClassVocabulary();
  const columns = useMemo<ColumnDef<GoalRow>[]>(
    () => [
      {
        id: "pupil",
        header: "Pupil",
        // The same cell the roll draws: the mark, the surname-first name, and
        // the admission number that tells two Tendai Moyos apart. Surname
        // first, because the rows are read against a class list.
        cell: ({ row }) => (
          <PersonCell
            kind="student"
            firstName={row.original.firstName}
            lastName={row.original.lastName}
            displayName={`${row.original.lastName}, ${row.original.firstName}`}
            href={recordType("STUDENT").href(row.original.studentId)}
            reference={row.original.studentNo}
          />
        ),
      },
      {
        id: "class",
        header: "Class",
        // A reference to a class is a link to the class, not a word about it:
        // "which other Form 2 pupils have no target" is one click from here
        // rather than a second search.
        cell: ({ row }) =>
          row.original.classId ? (
            <EntityLink
              href={recordType("CLASS").href(row.original.classId)}
              className={recordCellTone("relation")}
            >
              {[row.original.className, row.original.streamName]
                .filter(Boolean)
                .join(" · ")}
            </EntityLink>
          ) : (
            // Named in words: a child in no class is the row somebody has to
            // act on, and a dash under "Class" reads as a column that failed.
            <span className="text-sm text-[color:var(--text-muted)]">Not placed</span>
          ),
      },
      {
        id: "subject",
        header: "Subject",
        cell: ({ row }) =>
          row.original.subject ? (
            <EntityLink
              href={recordType("SUBJECT").href(row.original.subject.id)}
              className={recordCellTone("relation")}
            >
              {row.original.subject.name}
            </EntityLink>
          ) : (
            <span className="text-sm text-[color:var(--text-muted)]">Every subject</span>
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
          // One line, clamped. The plan is prose in a table of figures, and a
          // row that wraps to three lines doubles the height of every row
          // beside it.
          <span className="line-clamp-1">
            <RecordCell value={row.original.plan ?? row.original.teacherNote} />
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
        // An affordance, not a field — but the head still needs the cell, or
        // every column below it shifts by one.
        header: () => <span className="sr-only">Row actions</span>,
        cell: ({ row }) => (
          <RecordActions
            layout="menu"
            label={`Row actions for ${row.original.firstName} ${row.original.lastName}`}
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
      {/* No band. "With a target / With none / At or above" were three totals
          over four filters that did not govern them — narrow to Form 3 and the
          chips still answered for the school. Totals belong on an overview;
          the one number that stays is the row count, on the filter row beside
          the question it answers. §2 of the canvas law.

          The bulk verb was in the band's action slot, which is the page's one
          primary action wearing a summary strip. It is in the app bar now,
          where every campus screen puts it, and its count is still the
          filtered set — press it after narrowing to Form 3 and it writes to
          Form 3. */}
      <PageChrome title="Subject targets">
        <Button
          variant="primary"
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
      </PageChrome>

      {query.error ? (
        <LoadError
          what="the targets"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {writeError ? <SaveError what="The target" error={writeError} /> : null}
      {saved && !isWriting ? (
        <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} />
      ) : null}

      <TableControls
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search pupil, class or subject"
          />
        }
        filterCount={activeFilterCount(termId, classId, subjectId, standing)}
        filters={
          <>
            <FilterSelect
              label="Term"
              allLabel="This term"
              value={termId}
              options={termOptions}
              onChange={setTermId}
            />
            <FilterSelect
              label={words.One}
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
          </>
        }
        // The answer to whatever the row above just asked, beside the question.
        // The band's three numbers are the term's and must not move with it.
        count={query.isPending ? null : `${rows.length} of ${query.data?.rows.length ?? 0}`}
      />

      {query.isPending ? (
        <TableRowsSkeleton
          columns={[{ avatar: true, twoLine: true }, { width: 120 }, { width: 140 }, { width: 90 }, { width: 90 }, {}, { width: 110 }]}
        />
      ) : (
        <DataTable
          data={rows}
          columns={columns}
          // The narrowing is answered once, in the row above. Left on, the
          // table draws a second search box under the first.
          features={{ globalFilter: false, pagination: true }}
          pagination={{ enabled: true }}
          exportConfig={{ enabled: true, title: "Subject targets", fileName: "subject-targets" }}
          rowGroup={(row) =>
            row.className
              ? { key: row.className, label: row.className }
              : { key: "unplaced", label: "Not placed in a class" }
          }
          // Seven columns at 390px is a sideways scroll showing one and a half
          // of them. On a phone the row is the pupil, and the two figures the
          // screen is about — what they are aiming at and where they are —
          // read as the one line under the name.
          mobileListRenderer={({ rows: shown }) => (
            <MobileList>
              {shown.length === 0 ? (
                <MobileListEmpty>No pupils matched.</MobileListEmpty>
              ) : (
                shown.map(({ row }) => (
                  <MobileList.Row
                    key={`${row.studentId}-${row.subject?.id ?? "all"}`}
                    leading={
                      <RecordMark
                        kind="student"
                        name={`${row.firstName} ${row.lastName}`}
                        size="sm"
                      />
                    }
                    title={`${row.lastName}, ${row.firstName}`}
                    subtitle={[
                      row.studentNo,
                      row.className ?? "Not placed",
                      row.goalId === null
                        ? "No target"
                        : `Target ${percent(row.targetMark)} · now ${percent(row.currentMark)}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => {
                      setSaved(null);
                      setEditing(row);
                    }}
                  />
                ))
              )}
            </MobileList>
          )}
          emptyState={
            query.error ? (
              "Nothing to show while the targets cannot be loaded."
            ) : narrowing.length > 0 || search.trim() ? (
              <NothingMatched
                what="pupils"
                filters={narrowing}
                search={search}
                onClear={clearFilters}
              />
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

      {editing ? (
        <GoalTargetDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setEditing(null);
              setTargets.reset();
              reviseTarget.reset();
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
              : revising
                ? "Change the number, the plan or the subject it was recorded against. The target moves; a second one is not added."
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
          isSubmitting={isWriting}
          error={writeError ? getApiErrorMessage(writeError) : null}
          progress={
            editing === "bulk" && setTargets.isPending
              ? `${written} of ${missing.length} written`
              : null
          }
          onSubmit={(values) => {
            // A pupil who already has one is a correction and goes by id; a
            // pupil with nothing set, and the whole filtered set, are creates.
            if (editing !== "bulk" && editing.goalId !== null) {
              reviseTarget.mutate({
                goalId: editing.goalId,
                label: `${editing.firstName} ${editing.lastName}`,
                values,
              });
              return;
            }
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
            });
          }}
        />
      ) : null}
    </div>
  );
}
