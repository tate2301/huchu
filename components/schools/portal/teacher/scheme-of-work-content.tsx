"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, Card, TextArea } from "@corelithzw/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  NotYourJob,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsSubjects,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";

/**
 * The scheme of work, edited as what it is: a table whose rows are weeks.
 *
 * Pick a subject, a form and a term, and the term's teaching is laid out one
 * week per row — topic, objectives, activities, resources. This is the source
 * "lay out this week" reads: a teacher pressing that button in week 4 gets
 * week 4's row as their drafts, so what is written here is what the planner
 * opens saying.
 *
 * Saving replaces the whole named scheme. A deleted row is a week the scheme
 * no longer mentions; the planner then falls back to continuing the previous
 * topic for that week.
 *
 * Writing needs the `schools.academics` edit grant, which heads of department
 * hold and a plain teacher does not. The screen is in the teacher portal
 * anyway, because reading your own scheme is the common case and the person
 * who *writes* it is a teacher wearing the HOD hat — but the save is gated,
 * and says whose job it is rather than letting the API refuse after the fact.
 */

type SchemeWeek = {
  weekOfTerm: number;
  topic: string;
  objectives: string;
  activities: string;
  resourcesNote: string;
};

function blankWeek(weekOfTerm: number): SchemeWeek {
  return { weekOfTerm, topic: "", objectives: "", activities: "", resourcesNote: "" };
}

export function SchemeOfWorkContent() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();
  const mayWrite = access.can("schools.academics", "edit");
  const [subjectId, setSubjectId] = useState("");
  const [level, setLevel] = useState("");
  const [termId, setTermId] = useState("");
  const [weeks, setWeeks] = useState<SchemeWeek[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  /**
   * A term is thirteen cards on a phone. "Which week was the one about
   * bearings" is a real question, so the topic text is searchable rather than
   * something to be found by scrolling.
   */
  const [search, setSearch] = useState("");

  const subjectsQuery = useQuery({
    queryKey: ["schools", "subjects", "for-scheme"],
    queryFn: () => fetchSchoolsSubjects({ limit: 200, isActive: true }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "for-scheme"],
    queryFn: () => fetchSchoolsClasses({ limit: 200 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "for-scheme"],
    queryFn: () => fetchSchoolsTerms({ limit: 50 }),
  });

  const subjects = subjectsQuery.data?.data ?? [];
  const terms = termsQuery.data?.data ?? [];
  // The forms the school actually runs, from its classes — labelled by the
  // class names at each level, because the level number is internal ordering
  // ("Form 1" may sit at level 8, above ECD and the Grades) and a picker that
  // says "Form 8" for it would file the scheme against the wrong year group.
  const levels = useMemo(() => {
    const byLevel = new Map<number, Set<string>>();
    for (const row of classesQuery.data?.data ?? []) {
      if (row.level == null) continue;
      const names = byLevel.get(row.level) ?? new Set<string>();
      names.add(row.name);
      byLevel.set(row.level, names);
    }
    return [...byLevel.entries()]
      .sort(([a], [b]) => a - b)
      .map(([value, names]) => ({ value, label: [...names].sort().join(" / ") }));
  }, [classesQuery.data]);

  const ready = Boolean(subjectId && level && termId);

  const schemeQuery = useQuery({
    queryKey: ["schools", "syllabus", subjectId, level, termId],
    queryFn: () =>
      fetchJson<{ weeks: Array<SchemeWeek & { id: string }> }>(
        `/api/v2/schools/syllabus?subjectId=${subjectId}&termId=${termId}&level=${level}`,
      ),
    enabled: ready,
  });

  // The editable copy, reset whenever a different scheme is loaded.
  const loadedKey = `${subjectId}|${level}|${termId}|${schemeQuery.dataUpdatedAt}`;
  const [seenKey, setSeenKey] = useState("");
  if (schemeQuery.data && loadedKey !== seenKey) {
    setSeenKey(loadedKey);
    // An empty scheme stays empty rather than being seeded with a blank week:
    // "no scheme has been written for this term" and "somebody started one and
    // left week 1 blank" are different facts, and the empty state says the
    // first one properly.
    setWeeks(
      schemeQuery.data.weeks.map((week) => ({
        weekOfTerm: week.weekOfTerm,
        topic: week.topic,
        objectives: week.objectives ?? "",
        activities: week.activities ?? "",
        resourcesNote: week.resourcesNote ?? "",
      })),
    );
  }

  const addWeek = () => {
    setSaved(null);
    setWeeks((current) => [
      ...current,
      blankWeek(
        current.length > 0 ? Math.max(...current.map((week) => week.weekOfTerm)) + 1 : 1,
      ),
    ]);
  };

  /**
   * The narrowing hides cards; the save below still writes every week held in
   * state. A teacher who searched for one topic and pressed Save must not
   * delete the other twelve weeks of the term.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return weeks.map((week, index) => ({ week, index }));
    return weeks
      .map((week, index) => ({ week, index }))
      .filter(({ week }) =>
        `${week.weekOfTerm} ${week.topic} ${week.objectives} ${week.activities} ${week.resourcesNote}`
          .toLowerCase()
          .includes(needle),
      );
  }, [weeks, search]);

  const save = useMutation({
    mutationFn: () => {
      const filled = weeks.filter((week) => week.topic.trim());
      return fetchJson<{ saved: number }>("/api/v2/schools/syllabus", {
        method: "PUT",
        body: JSON.stringify({
          subjectId,
          termId,
          level: Number(level),
          weeks: filled.map((week) => ({
            weekOfTerm: week.weekOfTerm,
            topic: week.topic.trim(),
            objectives: week.objectives.trim() || null,
            activities: week.activities.trim() || null,
            resourcesNote: week.resourcesNote.trim() || null,
          })),
        }),
      });
    },
    onSuccess: (result) => {
      setSaved(
        `Scheme saved — ${result.saved} week${result.saved === 1 ? "" : "s"}. ` +
          "“Lay out this week” in the planner now drafts from it.",
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "syllabus"] });
    },
  });

  const setWeek = (index: number, patch: Partial<SchemeWeek>) => {
    setSaved(null);
    setWeeks((current) =>
      current.map((week, i) => (i === index ? { ...week, ...patch } : week)),
    );
  };

  const subjectName = subjects.find((row) => row.id === subjectId)?.name;
  const levelLabel = levels.find((row) => String(row.value) === level)?.label;

  return (
    <div className="space-y-4">
      {save.error ? <SaveError what="The scheme" error={save.error} /> : null}
      {schemeQuery.error ? (
        <LoadError
          what="the scheme"
          error={schemeQuery.error}
          onRetry={() => void schemeQuery.refetch()}
        />
      ) : null}
      {/* The three pickers are read separately, so a failure in one is named
          where it happened rather than blanking the screen. Nothing below can
          be chosen until they land, which is why these are not scoped lower. */}
      {subjectsQuery.error ? (
        <LoadError
          what="the subject list"
          error={subjectsQuery.error}
          onRetry={() => void subjectsQuery.refetch()}
        />
      ) : null}
      {classesQuery.error ? (
        <LoadError
          what="the form list"
          error={classesQuery.error}
          onRetry={() => void classesQuery.refetch()}
        />
      ) : null}
      {termsQuery.error ? (
        <LoadError
          what="the term list"
          error={termsQuery.error}
          onRetry={() => void termsQuery.refetch()}
        />
      ) : null}
      {saved ? <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} /> : null}
      {mayWrite ? null : (
        <NotYourJob action="edit" resource="schools.academics" what="A scheme of work" />
      )}

      <FilterBar>
        <FilterSelect
          label="Subject"
          allLabel="Choose a subject"
          value={subjectId}
          options={subjects.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(value) => {
            setSubjectId(value);
            setSaved(null);
          }}
        />
        <FilterSelect
          label="Form"
          allLabel="Choose a form"
          value={level}
          options={levels.map((row) => ({ value: String(row.value), label: row.label }))}
          onChange={(value) => {
            setLevel(value);
            setSaved(null);
          }}
        />
        <FilterSelect
          label="Term"
          allLabel="Choose a term"
          value={termId}
          options={terms.map((row) => ({
            value: row.id,
            label: `${row.name} · ${row.academicYear.name}${row.isActive ? " (current)" : ""}`,
          }))}
          onChange={(value) => {
            setTermId(value);
            setSaved(null);
          }}
        />
      </FilterBar>

      {!ready ? (
        <Card title="Pick a subject, a form and a term">
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            A scheme of work is one subject&apos;s term for one form, week by week. What is
            written here becomes the drafts a teacher gets from “Lay out this week” in the
            lesson planner.
          </p>
        </Card>
      ) : schemeQuery.isPending ? (
        /* One card per week below, so the wait is cards. Two lines each: the
           week's objectives and its activities are what fill a card's body. */
        <CardsSkeleton count={4} columns={1} lines={2} />
      ) : (
        <Card
          title={`${subjectName ?? "Subject"} — ${levelLabel ?? "Form"}`}
          subtitle={`${weeks.length} week${weeks.length === 1 ? "" : "s"} laid out. A week with no topic is dropped on save.`}
          actions={
            <Button
              loading={save.isPending}
              disabled={!mayWrite}
              title={
                mayWrite
                  ? undefined
                  : "This is a school administrator or head of department to do."
              }
              onClick={() => save.mutate()}
            >
              Save the scheme
            </Button>
          }
        >
          {weeks.length > 0 ? (
            <div className="mb-4 max-w-[22rem]">
              <Label htmlFor="scheme-search" className="text-sm text-muted-foreground">
                Find a week
              </Label>
              <Input
                id="scheme-search"
                value={search}
                placeholder="A topic, a resource, a week number"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          ) : null}

          {weeks.length === 0 ? (
            <NothingYet
              title="No scheme has been written for this term"
              body="Lay the term out one week at a time and “Lay out this week” in the lesson planner drafts from it."
              action={
                mayWrite ? (
                  <Button variant="secondary" onClick={addWeek}>
                    Add the first week
                  </Button>
                ) : undefined
              }
            />
          ) : visible.length === 0 ? (
            <NothingMatched
              what="weeks"
              filters={[search.trim()]}
              onClear={() => setSearch("")}
            />
          ) : (
          /*
            The whole term goes under the overlay while the PUT is in flight.
            The save replaces the named scheme wholesale, so a week edited
            halfway through the write is a week that quietly does not exist.
          */
          <SavingOverlay saving={save.isPending} label="Saving the scheme…">
            <div className="space-y-4">
              {visible.map(({ week, index }) => (
                <div
                  key={week.weekOfTerm}
                  className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[length:var(--type-body-sm)] font-semibold text-[color:var(--text-strong)]">
                      Week {week.weekOfTerm}
                    </p>
                    <Button
                      variant="ghost"
                      disabled={!mayWrite}
                      onClick={() => {
                        setSaved(null);
                        setWeeks((current) => current.filter((_, i) => i !== index));
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <Label htmlFor={`topic-${week.weekOfTerm}`}>Topic</Label>
                      <Input
                        id={`topic-${week.weekOfTerm}`}
                        value={week.topic}
                        placeholder="What is taught this week"
                        onChange={(event) => setWeek(index, { topic: event.target.value })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`objectives-${week.weekOfTerm}`}>Objectives</Label>
                      <TextArea
                        id={`objectives-${week.weekOfTerm}`}
                        rows={3}
                        value={week.objectives}
                        placeholder="By the end of the week, pupils can…"
                        onChange={(event) =>
                          setWeek(index, { objectives: event.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor={`activities-${week.weekOfTerm}`}>Activities</Label>
                      <TextArea
                        id={`activities-${week.weekOfTerm}`}
                        rows={3}
                        value={week.activities}
                        placeholder="How the week runs"
                        onChange={(event) =>
                          setWeek(index, { activities: event.target.value })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor={`resources-${week.weekOfTerm}`}>Resources</Label>
                      <Input
                        id={`resources-${week.weekOfTerm}`}
                        value={week.resourcesNote}
                        placeholder="Textbook chapters, equipment, handouts"
                        onChange={(event) =>
                          setWeek(index, { resourcesNote: event.target.value })
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="secondary" disabled={!mayWrite} onClick={addWeek}>
                Add a week
              </Button>
            </div>
          </SavingOverlay>
          )}
        </Card>
      )}
    </div>
  );
}
