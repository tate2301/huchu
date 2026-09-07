"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListEmpty, MobileListSectionHeader } from "@corelithzw/react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { FilterBar, FilterSelect } from "../common/filter-select";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "../common/states";
import { getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchSchoolsClasses } from "../../admin-v2";
import {
  ASSESSMENT_KIND_LABELS,
  createSchoolAssessment,
  deleteSchoolAssessment,
  fetchClassSubjects,
  fetchSchoolAssessments,
  fetchTermMarks,
  rollUpTermMarksRequest,
  updateSchoolAssessment,
  type AssessmentKind,
  type SchoolsAssessmentRecord,
} from "../../assessments-v2";
import { AssessmentFormSheet, type AssessmentFormValues } from "./assessment-form-sheet";
import { MarkEntrySheet } from "./mark-entry-sheet";
import { HomeworkContent } from "./homework-content";

type View = "work" | "homework" | "marks";

const KIND_OPTIONS = (Object.keys(ASSESSMENT_KIND_LABELS) as AssessmentKind[]).map(
  (kind) => ({ value: kind, label: ASSESSMENT_KIND_LABELS[kind] }),
);

function subjectHeading(assessment: SchoolsAssessmentRecord) {
  const stream = assessment.classSubject.stream;
  return stream
    ? `${assessment.classSubject.subject.name} — ${stream.name}`
    : assessment.classSubject.subject.name;
}

/**
 * One year group's assessments, and what they add up to.
 *
 * This screen serves both shapes of school without being two screens. A
 * primary class teacher opens her one class and sees every subject grouped
 * under its own heading; a secondary subject teacher opens a class and filters
 * to the subject she takes. The office opens the same page for either, which is
 * the point — when a teacher is away, somebody still has to enter the marks.
 *
 * Two views. "Work set" is the list of tests and papers, each a mark sheet away.
 * "Term marks" is what those add up to under the school's grading scheme, and
 * the button that writes them onto the result sheet the school moderates.
 */
export function ClassAssessmentsContent({
  classId,
  initialStreamId,
}: {
  classId: string;
  initialStreamId?: string;
}) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("work");
  const [streamFilter, setStreamFilter] = useState(initialStreamId ?? "");
  const [subjectFilter, setSubjectFilter] = useState("");
  const [kindFilter, setKindFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rollUpNote, setRollUpNote] = useState<string | null>(null);

  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });

  const assessmentsQuery = useQuery({
    queryKey: ["schools", "assessments", "class", classId, streamFilter],
    queryFn: () =>
      fetchSchoolAssessments({
        classId,
        streamId: streamFilter || undefined,
      }),
  });

  const subjectsQuery = useQuery({
    queryKey: ["schools", "assessments", "subjects", classId, streamFilter],
    queryFn: () =>
      fetchClassSubjects({ classId, streamId: streamFilter || undefined }),
  });

  const marksQuery = useQuery({
    queryKey: ["schools", "assessments", "term-marks", classId, streamFilter],
    queryFn: () =>
      fetchTermMarks({ classId, streamId: streamFilter || undefined }),
    enabled: view === "marks",
  });

  const schoolClass = useMemo(
    () => (classesQuery.data?.data ?? []).find((row) => row.id === classId) ?? null,
    [classesQuery.data, classId],
  );
  const streams = schoolClass?.streams ?? [];

  const assessments = useMemo(
    () => assessmentsQuery.data?.assessments ?? [],
    [assessmentsQuery.data],
  );
  const subjects = useMemo(() => subjectsQuery.data?.data ?? [], [subjectsQuery.data]);

  const subjectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const assessment of assessments) {
      seen.set(assessment.classSubject.subject.id, assessment.classSubject.subject.name);
    }
    for (const option of subjects) {
      seen.set(option.subject.id, option.subject.name);
    }
    return [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [assessments, subjects]);

  const visible = useMemo(
    () =>
      assessments.filter((assessment) => {
        if (subjectFilter && assessment.classSubject.subject.id !== subjectFilter) {
          return false;
        }
        if (kindFilter && assessment.kind !== kindFilter) return false;
        return true;
      }),
    [assessments, subjectFilter, kindFilter],
  );

  // The filters in the office's own words, so an emptied list can repeat them
  // back. Read off the option lists rather than the ids, which mean nothing to
  // anybody looking at the screen.
  const narrowing = [
    streams.find((stream) => stream.id === streamFilter)?.name,
    subjectOptions.find((option) => option.value === subjectFilter)?.label,
    kindFilter ? ASSESSMENT_KIND_LABELS[kindFilter as AssessmentKind] : undefined,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setStreamFilter("");
    setSubjectFilter("");
    setKindFilter("");
  };

  // Grouped by subject, which is how a mark book is laid out. The API already
  // orders by subject name, so this preserves the order rather than imposing
  // its own.
  const grouped = useMemo(() => {
    const map = new Map<string, SchoolsAssessmentRecord[]>();
    for (const assessment of visible) {
      const key = subjectHeading(assessment);
      const bucket = map.get(key);
      if (bucket) bucket.push(assessment);
      else map.set(key, [assessment]);
    }
    return [...map.entries()];
  }, [visible]);

  const createMutation = useMutation({
    mutationFn: (values: AssessmentFormValues) =>
      createSchoolAssessment({
        classSubjectId: values.classSubjectId,
        kind: values.kind,
        title: values.title.trim(),
        maxScore: Number(values.maxScore),
        weight: Number(values.weight),
        assessedOn: values.assessedOn || null,
      }),
    onSuccess: () => {
      setFormOpen(false);
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "assessments"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const lockMutation = useMutation({
    mutationFn: (input: { id: string; status: "OPEN" | "LOCKED" }) =>
      updateSchoolAssessment(input.id, { status: input.status }),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "assessments"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSchoolAssessment(id),
    onSuccess: () => {
      setActionError(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "assessments"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const rollUpMutation = useMutation({
    mutationFn: () =>
      rollUpTermMarksRequest({ classId, streamId: streamFilter || null }),
    onSuccess: (result) => {
      setActionError(null);
      setRollUpNote(
        `${result.linesWritten} mark${result.linesWritten === 1 ? "" : "s"} written to the result sheet` +
          (result.skipped > 0 ? `, ${result.skipped} skipped with nothing marked` : ""),
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "results"] });
    },
    onError: (error) => setActionError(getApiErrorMessage(error)),
  });

  const marks = useMemo(() => marksQuery.data?.marks ?? [], [marksQuery.data]);
  const scheme = marksQuery.data?.scheme ?? null;

  // Grouped by child rather than repeating the name on every subject line. A
  // term-mark list is read one child at a time — it is the report card before
  // it is a report card — and ten identical names in a column is a table
  // pretending to be a list.
  const marksByStudent = useMemo(() => {
    const map = new Map<string, typeof marks>();
    for (const row of marks) {
      const key = `${row.student.lastName}, ${row.student.firstName}`;
      const bucket = map.get(key);
      if (bucket) bucket.push(row);
      else map.set(key, [row]);
    }
    return [...map.entries()];
  }, [marks]);

  return (
    <div className="space-y-4">
      {assessmentsQuery.error ? (
        <LoadError
          what="the assessments"
          error={assessmentsQuery.error}
          onRetry={() => void assessmentsQuery.refetch()}
        />
      ) : null}
      {actionError ? <SaveError what="That change" error={actionError} /> : null}
      {rollUpNote ? (
        <Alert>
          <AlertTitle>Rolled up</AlertTitle>
          <AlertDescription>{rollUpNote}</AlertDescription>
        </Alert>
      ) : null}

      <VerticalDataViews
        items={[
          { id: "work", label: "Work set", count: assessments.length },
          { id: "homework", label: "Homework" },
          { id: "marks", label: "Term marks" },
        ]}
        value={view}
        onValueChange={(value) => setView(value as View)}
        railLabel="Assessment views"
      >
        {view === "work" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <FilterBar>
                {streams.length > 0 ? (
                  <FilterSelect
                    label="Class"
                    allLabel="Every class"
                    value={streamFilter}
                    options={streams.map((stream) => ({
                      value: stream.id,
                      label: stream.name,
                    }))}
                    onChange={setStreamFilter}
                  />
                ) : null}
                <FilterSelect
                  label="Subject"
                  allLabel="Every subject"
                  value={subjectFilter}
                  options={subjectOptions}
                  onChange={setSubjectFilter}
                />
                <FilterSelect
                  label="Kind"
                  allLabel="Anything"
                  value={kindFilter}
                  options={KIND_OPTIONS}
                  onChange={setKindFilter}
                />
              </FilterBar>
              <Button
                onClick={() => setFormOpen(true)}
                disabled={subjects.length === 0}
              >
                New assessment
              </Button>
            </div>

            {subjects.length === 0 && !subjectsQuery.isLoading ? (
              <Alert>
                <AlertTitle>No subjects assigned to this year group</AlertTitle>
                <AlertDescription>
                  Marks hang off a teacher&rsquo;s subject assignment. Allocate the
                  subjects under Teachers before setting work.
                </AlertDescription>
              </Alert>
            ) : null}

            {assessmentsQuery.isPending ? (
              <TableRowsSkeleton
                headers={["Assessment", "Out of", "Marked"]}
                columns={[{ twoLine: true }, { width: 110 }, { width: 90, badge: true }]}
                rows={6}
              />
            ) : (
              /*
                Locking, reopening and removing all write to the same list, so
                the whole list dims while one of them is in flight — a second
                Lock pressed on the row below while the first is still going is
                two writes racing for the same refetch.
              */
              <SavingOverlay
                saving={lockMutation.isPending || deleteMutation.isPending}
                label="Saving…"
              >
                <MobileList>
                  {grouped.length === 0 ? (
                    <MobileListEmpty>
                      {narrowing.length > 0 ? (
                        <NothingMatched
                          what="assessments"
                          filters={narrowing}
                          onClear={clearFilters}
                        />
                      ) : (
                        <NothingYet
                          title="No work set for this year group yet"
                          body="A test, a paper or a practical set here becomes a mark sheet, and the term mark is what they add up to."
                          action={
                            <Button
                              onClick={() => setFormOpen(true)}
                              disabled={subjects.length === 0}
                            >
                              New assessment
                            </Button>
                          }
                        />
                      )}
                    </MobileListEmpty>
                  ) : (
                    grouped.map(([heading, rows]) => (
                  <div key={heading}>
                    <MobileListSectionHeader>{heading}</MobileListSectionHeader>
                    {rows.map((assessment) => (
                      <MobileList.Row
                        key={assessment.id}
                        static
                        title={assessment.title}
                        subtitle={
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <span>
                              {ASSESSMENT_KIND_LABELS[assessment.kind]} · out of{" "}
                              {Number(assessment.maxScore)}
                              {Number(assessment.weight) !== 1
                                ? ` · counts ×${Number(assessment.weight)}`
                                : ""}
                              {assessment.assessedOn
                                ? ` · ${assessment.assessedOn.slice(0, 10)}`
                                : ""}
                            </span>
                            <Badge variant="outline">
                              {assessment._count.scores} marked
                            </Badge>
                            {assessment.status === "LOCKED" ? (
                              <Badge variant="secondary">Locked</Badge>
                            ) : null}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setMarkingId(assessment.id)}
                            >
                              {assessment._count.scores > 0 ? "Marks" : "Enter marks"}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={lockMutation.isPending}
                              onClick={() =>
                                lockMutation.mutate({
                                  id: assessment.id,
                                  status:
                                    assessment.status === "LOCKED" ? "OPEN" : "LOCKED",
                                })
                              }
                            >
                              {assessment.status === "LOCKED" ? "Reopen" : "Lock"}
                            </Button>
                            {assessment._count.scores === 0 ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={deleteMutation.isPending}
                                onClick={() => deleteMutation.mutate(assessment.id)}
                              >
                                Remove
                              </Button>
                            ) : null}
                          </span>
                        }
                      />
                    ))}
                  </div>
                    ))
                  )}
                </MobileList>
              </SavingOverlay>
            )}
          </div>
        ) : null}

        {view === "homework" ? (
          <HomeworkContent
            classId={classId}
            streamId={streamFilter || undefined}
            subjects={subjects}
          />
        ) : null}

        {view === "marks" ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {scheme
                  ? `${scheme.name}: ${scheme.continuousWeight}% class work, ${scheme.examWeight}% exam. Pass at ${scheme.passMark}.`
                  : "Working the marks out…"}
              </p>
              <Button
                onClick={() => rollUpMutation.mutate()}
                disabled={rollUpMutation.isPending || marks.length === 0}
              >
                {rollUpMutation.isPending ? "Writing…" : "Write to result sheet"}
              </Button>
            </div>

            {marksQuery.error ? (
              <LoadError
                what="the term marks"
                error={marksQuery.error}
                onRetry={() => void marksQuery.refetch()}
              />
            ) : null}

            {marksQuery.isPending ? (
              /*
                Cards, not table rows: a term mark is read one child at a time,
                and the list below is grouped under a name rather than laid out
                in columns.
              */
              <CardsSkeleton count={6} columns={2} lines={3} />
            ) : (
              /*
                Writing to the result sheet rewrites every line at once. The
                list dims while it goes, because a second press halfway through
                is a second write against marks that are already moving.
              */
              <SavingOverlay
                saving={rollUpMutation.isPending}
                label="Writing to the result sheet…"
              >
                <MobileList>
                  {marksByStudent.length === 0 ? (
                    <MobileListEmpty>
                      {narrowing.length > 0 ? (
                        <NothingMatched
                          what="term marks"
                          filters={narrowing}
                          onClear={clearFilters}
                        />
                      ) : (
                        <NothingYet
                          title="Nothing marked yet, so there is nothing to add up"
                          body="A term mark is what the work set adds up to. Set a test under Work set and enter its marks, and the totals appear here."
                        />
                      )}
                    </MobileListEmpty>
                  ) : (
                    marksByStudent.map(([student, rows]) => (
                  <div key={student}>
                    <MobileListSectionHeader>{student}</MobileListSectionHeader>
                    {rows.map((row) => (
                      <MobileList.Row
                        key={`${row.studentId}-${row.classSubjectId}`}
                        static
                        title={row.subject.name}
                        subtitle={
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <span>
                              {row.mark === null ? "Not marked" : `${row.mark}%`}
                              {row.continuous !== null
                                ? ` · class work ${row.continuous}%`
                                : ""}
                              {row.exam !== null ? ` · exam ${row.exam}%` : ""}
                            </span>
                            {row.grade ? (
                              <Badge variant="secondary">{row.grade.grade}</Badge>
                            ) : null}
                            {row.caveat ? (
                              <Badge variant="outline">{row.caveat}</Badge>
                            ) : null}
                          </span>
                        }
                      />
                    ))}
                  </div>
                    ))
                  )}
                </MobileList>
              </SavingOverlay>
            )}
          </div>
        ) : null}
      </VerticalDataViews>

      <AssessmentFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        subjects={subjects}
        isSubmitting={createMutation.isPending}
        error={createMutation.isError ? actionError : null}
        onSubmit={(values) => createMutation.mutate(values)}
      />

      <MarkEntrySheet
        assessmentId={markingId}
        open={markingId !== null}
        onOpenChange={(open) => {
          if (!open) setMarkingId(null);
        }}
      />
    </div>
  );
}
