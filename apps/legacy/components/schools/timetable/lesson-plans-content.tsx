"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MobileList, MobileListSectionHeader } from "@corelithzw/react";

import { Alert, AlertDescription, AlertTitle } from "@corelithzw/ui/components/alert";
import { Badge } from "@corelithzw/ui/components/badge";
import { Button } from "@corelithzw/ui/components/button";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { Textarea } from "@corelithzw/ui/components/textarea";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchTeacherProfiles } from "@/lib/schools/admin-v2";
import { DAY_NAMES, formatMinute } from "@/lib/schools/timetable-format";

type Plan = {
  id: string;
  lessonDate: string;
  topic: string;
  objectives: string | null;
  activities: string | null;
  homeworkNote: string | null;
  reflection: string | null;
  slot: {
    id: string;
    dayOfWeek: number;
    period: { code: string; name: string; startMinute: number };
  } | null;
  classSubject: {
    id: string;
    subject: { id: string; name: string };
    class: { id: string; name: string };
    stream: { id: string; name: string } | null;
  };
  cover: {
    id: string;
    reason: string | null;
    coveringTeacher: { id: string; user: { name: string | null } };
  } | null;
};

type SubjectOption = {
  id: string;
  subject: { name: string };
  class?: { name: string };
  stream: { name: string } | null;
};

/** Monday of the week containing `date`, as YYYY-MM-DD. */
function weekStartOf(date: Date) {
  const copy = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = copy.getUTCDay();
  // Sunday is 0, and a school week starts on Monday.
  copy.setUTCDate(copy.getUTCDate() - (day === 0 ? 6 : day - 1));
  return copy.toISOString().slice(0, 10);
}

function addWeeks(iso: string, weeks: number) {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + weeks * 7);
  return date.toISOString().slice(0, 10);
}

/**
 * A week of lesson plans, and who is covering what.
 *
 * A week rather than a term, because that is the unit a teacher plans in and
 * the unit copy-forward works on. "Most of next week is last week's shape with
 * different topics" is the observation the whole screen is built around —
 * retyping the objectives is what stops teachers planning at all.
 */
export function LessonPlansContent({
  subjects,
  mine,
}: {
  subjects: SubjectOption[];
  /** The teacher portal's view: only their own lessons. */
  mine?: boolean;
}) {
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [subjectFilter, setSubjectFilter] = useState("");
  const [editing, setEditing] = useState<Plan | null>(null);
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [coverFor, setCoverFor] = useState<Plan | null>(null);
  const [coverTeacher, setCoverTeacher] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    topic: "",
    objectives: "",
    activities: "",
    homeworkNote: "",
    reflection: "",
    lessonDate: "",
  });

  const weekQuery = useQuery({
    queryKey: ["schools", "lesson-plans", weekStart, subjectFilter, mine ?? false],
    queryFn: () =>
      fetchJson<{ plans: Plan[] }>(
        `/api/v2/schools/lesson-plans?${new URLSearchParams({
          weekStart,
          ...(subjectFilter ? { classSubjectId: subjectFilter } : {}),
          ...(mine ? { mine: "true" } : {}),
        }).toString()}`,
      ),
  });

  const teachersQuery = useQuery({
    queryKey: ["schools", "teachers", "cover"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200 }),
    enabled: coverFor !== null,
  });

  const plans = useMemo(() => weekQuery.data?.plans ?? [], [weekQuery.data]);

  const grouped = useMemo(() => {
    const map = new Map<string, Plan[]>();
    for (const plan of plans) {
      const key = plan.lessonDate.slice(0, 10);
      const bucket = map.get(key);
      if (bucket) bucket.push(plan);
      else map.set(key, [plan]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [plans]);

  const saveMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchJson("/api/v2/schools/lesson-plans", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setEditing(null);
      setCreatingFor(null);
      setCoverFor(null);
      setCoverTeacher("");
      void queryClient.invalidateQueries({ queryKey: ["schools", "lesson-plans"] });
    },
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ copied: number; skipped: number; message: string | null }>(
        "/api/v2/schools/lesson-plans",
        {
          method: "POST",
          body: JSON.stringify({
            action: "copy-week",
            classSubjectId: subjectFilter,
            fromWeekStart: addWeeks(weekStart, -1),
            toWeekStart: weekStart,
          }),
        },
      ),
    onSuccess: (result) => {
      setNote(
        `${result.copied} lesson${result.copied === 1 ? "" : "s"} copied from last week` +
          (result.message ? `. ${result.message}` : ""),
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "lesson-plans"] });
    },
  });

  const layOutMutation = useMutation({
    mutationFn: () =>
      fetchJson<{
        created: number;
        skipped: number;
        seededFrom: string | null;
        fromScheme: boolean;
        message: string | null;
      }>("/api/v2/schools/lesson-plans", {
        method: "POST",
        body: JSON.stringify({
          action: "lay-out-week",
          classSubjectId: subjectFilter,
          weekStart,
        }),
      }),
    onSuccess: (result) => {
      setNote(
        result.created === 0
          ? (result.message ?? "Every lesson this week is already planned")
          : result.fromScheme
            ? `${result.created} draft${result.created === 1 ? "" : "s"} laid out from the scheme of work — “${result.seededFrom}”`
            : `${result.created} draft${result.created === 1 ? "" : "s"} laid out from the timetable` +
                (result.seededFrom ? `, picking up from “${result.seededFrom}”` : ""),
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "lesson-plans"] });
    },
  });

  /**
   * Tearing a plan out.
   *
   * The planner could write and rewrite and that was all, so a week laid out
   * against the wrong subject left a fortnight of drafts nobody could clear —
   * and because "lay out from timetable" skips a day that already has a plan
   * on it, an unremovable wrong plan is also a lesson that can never be laid
   * out correctly.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/schools/lesson-plans/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "lesson-plans"] });
    },
  });

  const covered = plans.filter((plan) => plan.cover).length;

  // Both bulk verbs write a whole week of drafts at once. The planner dims
  // under them: a teacher who opens a plan mid-copy is editing a row that is
  // about to be replaced by the one being written.
  const layingOut = copyMutation.isPending || layOutMutation.isPending;

  return (
    <div className="space-y-4">
      {weekQuery.error ? (
        <LoadError
          what="this week's lesson plans"
          error={weekQuery.error}
          onRetry={() => void weekQuery.refetch()}
        />
      ) : null}
      {/* One sentence per verb. "The week would not copy" and "the lesson
          would not be torn up" send a teacher to different places, and the
          single shared string they replaced sent them to neither. */}
      {copyMutation.error ? (
        <SaveError what="Last week's plans" error={copyMutation.error} />
      ) : null}
      {layOutMutation.error ? (
        <SaveError what="The week's drafts" error={layOutMutation.error} />
      ) : null}
      {deleteMutation.error ? (
        <SaveError what="The lesson plan" error={deleteMutation.error} />
      ) : null}
      {note ? (
        <Alert>
          <AlertTitle>Done</AlertTitle>
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <FilterBar>
          <div className="min-w-0 flex-1 basis-[180px] sm:max-w-[200px]">
            <Label htmlFor="week-start" className="text-sm text-muted-foreground">
              Week beginning
            </Label>
            <Input
              id="week-start"
              type="date"
              value={weekStart}
              onChange={(event) =>
                setWeekStart(weekStartOf(new Date(`${event.target.value}T00:00:00Z`)))
              }
            />
          </div>
          <FilterSelect
            label="Subject"
            allLabel="Everything I teach"
            value={subjectFilter}
            options={subjects.map((option) => ({
              value: option.id,
              label: `${option.subject.name}${option.class ? ` — ${option.class.name}` : ""}`,
            }))}
            onChange={setSubjectFilter}
          />
        </FilterBar>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => setWeekStart(addWeeks(weekStart, -1))}>
            Last week
          </Button>
          <Button variant="outline" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
            Next week
          </Button>
          <Button
            variant="outline"
            disabled={!subjectFilter || layOutMutation.isPending}
            onClick={() => layOutMutation.mutate()}
            title={
              subjectFilter
                ? undefined
                : "Choose a subject first — the timetable is laid out one subject at a time"
            }
          >
            {layOutMutation.isPending ? "Laying out…" : "Lay out from timetable"}
          </Button>
          <Button
            variant="outline"
            disabled={!subjectFilter || copyMutation.isPending}
            onClick={() => copyMutation.mutate()}
            title={
              subjectFilter
                ? undefined
                : "Choose a subject first — copy-forward works one subject at a time"
            }
          >
            {copyMutation.isPending ? "Copying…" : "Copy last week"}
          </Button>
          <Button
            disabled={subjects.length === 0}
            onClick={() => {
              setCreatingFor(subjectFilter || subjects[0]?.id || "");
              setDraft({
                topic: "",
                objectives: "",
                activities: "",
                homeworkNote: "",
                reflection: "",
                lessonDate: weekStart,
              });
            }}
          >
            Plan a lesson
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {plans.length} lesson{plans.length === 1 ? "" : "s"} planned for the week of{" "}
        {weekStart}
        {covered > 0 ? ` · ${covered} covered` : ""}
      </p>

      {weekQuery.isPending ? (
        // A skeleton week, not an empty grid. The planner opens on a week that
        // is nearly always full, so a blank list while it loads reads as "you
        // have planned nothing" — the exact wrong thing to tell a teacher.
        <CardsSkeleton count={5} columns={1} lines={2} />
      ) : grouped.length === 0 ? (
        subjectFilter ? (
          <NothingMatched
            what="lessons"
            filters={[
              subjects.find((option) => option.id === subjectFilter)?.subject.name,
              `week of ${weekStart}`,
            ].filter((value): value is string => Boolean(value))}
            onClear={() => setSubjectFilter("")}
          />
        ) : (
          <NothingYet
            title={`Nothing planned for the week of ${weekStart}`}
            body="Lay the week out from the timetable, copy last week forward, or plan a single lesson."
            action={
              <Button
                variant="outline"
                disabled={subjects.length === 0}
                onClick={() => {
                  setCreatingFor(subjects[0]?.id ?? "");
                  setDraft({
                    topic: "",
                    objectives: "",
                    activities: "",
                    homeworkNote: "",
                    reflection: "",
                    lessonDate: weekStart,
                  });
                }}
              >
                Plan a lesson
              </Button>
            }
          />
        )
      ) : (
        <SavingOverlay saving={layingOut} label="Laying the week out…">
          <MobileList>
            {grouped.map(([day, dayPlans]) => (
                <div key={day}>
                  <MobileListSectionHeader>
                    {DAY_NAMES[new Date(`${day}T00:00:00Z`).getUTCDay() || 7] ?? day} · {day}
                  </MobileListSectionHeader>
                  {dayPlans.map((plan) => (
                    <MobileList.Row
                      key={plan.id}
                      static
                      title={plan.topic}
                      subtitle={
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <span>
                            {plan.classSubject.subject.name} · {plan.classSubject.class.name}
                            {plan.slot
                              ? ` · ${plan.slot.period.code} ${formatMinute(plan.slot.period.startMinute)}`
                              : ""}
                          </span>
                          {plan.cover ? (
                            <Badge variant="secondary">
                              Covered by {plan.cover.coveringTeacher.user.name ?? "somebody"}
                            </Badge>
                          ) : null}
                          {plan.reflection ? (
                            <Badge variant="outline">Reflected on</Badge>
                          ) : null}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(plan);
                              setDraft({
                                topic: plan.topic,
                                objectives: plan.objectives ?? "",
                                activities: plan.activities ?? "",
                                homeworkNote: plan.homeworkNote ?? "",
                                reflection: plan.reflection ?? "",
                                lessonDate: plan.lessonDate.slice(0, 10),
                              });
                            }}
                          >
                            Open
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setCoverFor(plan);
                              setCoverTeacher("");
                            }}
                          >
                            {plan.cover ? "Change cover" : "Arrange cover"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={deleteMutation.isPending}
                            onClick={async () => {
                              const confirmed = await dsConfirm({
                                title: `Tear up “${plan.topic}”?`,
                                description:
                                  "The lesson leaves the week. Any cover arranged for it goes with it, and the slot becomes one that can be laid out again.",
                                confirmLabel: "Tear it up",
                                variant: "danger",
                              });
                              if (confirmed) deleteMutation.mutate(plan.id);
                            }}
                          >
                            Tear it up
                          </Button>
                        </span>
                      }
                    />
                  ))}
                </div>
            ))}
          </MobileList>
        </SavingOverlay>
      )}

      <RecordDialog
        open={editing !== null || creatingFor !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditing(null);
            setCreatingFor(null);
          }
        }}
        title={editing ? editing.topic : "Plan a lesson"}
        size="lg"
        errors={saveMutation.error ? [getApiErrorMessage(saveMutation.error)] : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (saveMutation.isPending || !draft.topic.trim()) return;
          saveMutation.mutate({
            action: "save",
            ...(editing ? { id: editing.id } : {}),
            classSubjectId: editing ? editing.classSubject.id : creatingFor,
            slotId: editing?.slot?.id ?? null,
            lessonDate: draft.lessonDate,
            topic: draft.topic.trim(),
            objectives: draft.objectives.trim() || null,
            activities: draft.activities.trim() || null,
            homeworkNote: draft.homeworkNote.trim() || null,
            reflection: draft.reflection.trim() || null,
          });
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditing(null);
                setCreatingFor(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!draft.topic.trim() || saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="plan-date">Date</Label>
            <Input
              id="plan-date"
              type="date"
              value={draft.lessonDate}
              onChange={(event) =>
                setDraft((current) => ({ ...current, lessonDate: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-topic">Topic</Label>
            <Input
              id="plan-topic"
              value={draft.topic}
              maxLength={300}
              onChange={(event) =>
                setDraft((current) => ({ ...current, topic: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="plan-objectives">By the end they will be able to</Label>
            <Textarea
              id="plan-objectives"
              rows={2}
              value={draft.objectives}
              onChange={(event) =>
                setDraft((current) => ({ ...current, objectives: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="plan-activities">What happens in the lesson</Label>
            <Textarea
              id="plan-activities"
              rows={3}
              value={draft.activities}
              onChange={(event) =>
                setDraft((current) => ({ ...current, activities: event.target.value }))
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="plan-homework">Homework set</Label>
            <Input
              id="plan-homework"
              value={draft.homeworkNote}
              onChange={(event) =>
                setDraft((current) => ({ ...current, homeworkNote: event.target.value }))
              }
            />
          </div>
          {editing ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="plan-reflection">Afterwards</Label>
              <Textarea
                id="plan-reflection"
                rows={2}
                value={draft.reflection}
                placeholder="Ran out of time on the last two questions"
                onChange={(event) =>
                  setDraft((current) => ({ ...current, reflection: event.target.value }))
                }
              />
              <p className="text-sm text-muted-foreground">
                Not carried forward when the week is copied — it is about this
                lesson.
              </p>
            </div>
          ) : null}
        </div>
      </RecordDialog>

      <RecordDialog
        open={coverFor !== null}
        onOpenChange={(open) => {
          if (!open) setCoverFor(null);
        }}
        title="Arrange cover"
        size="md"
        errors={saveMutation.error ? [getApiErrorMessage(saveMutation.error)] : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (!coverFor || !coverTeacher || saveMutation.isPending) return;
          saveMutation.mutate({
            action: "cover",
            lessonPlanId: coverFor.id,
            coveringTeacherProfileId: coverTeacher,
          });
        }}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setCoverFor(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!coverTeacher || saveMutation.isPending}>
              {saveMutation.isPending ? "Arranging…" : "Arrange it"}
            </Button>
          </div>
        }
      >
        {coverFor ? (
          <p className="text-sm text-muted-foreground">
            {coverFor.topic} · {coverFor.classSubject.subject.name} ·{" "}
            {coverFor.classSubject.class.name} · {coverFor.lessonDate.slice(0, 10)}
          </p>
        ) : null}
        <FilterSelect
          label="Who is taking it"
          allLabel="Choose a teacher"
          value={coverTeacher}
          options={(teachersQuery.data?.data ?? []).map((profile) => ({
            value: profile.id,
            label: profile.user.name ?? profile.employeeCode,
          }))}
          onChange={setCoverTeacher}
        />
        <p className="text-sm text-muted-foreground">
          A teacher already teaching in that period is refused — the clash is
          checked against the timetable.
        </p>
      </RecordDialog>
    </div>
  );
}
