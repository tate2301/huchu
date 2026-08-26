"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, MobileList, MobileListEmpty } from "@corelithzw/react";

import { PageBand } from "@/components/schools/common/page-band";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { LoadError } from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { DAY_NAMES, formatMinute } from "@/lib/schools/timetable-format";
import {
  fetchSchoolsPeriods,
  fetchSchoolsRooms,
  fetchSchoolsTimetable,
  fetchTeacherAssignments,
  fetchTeacherProfiles,
  fetchSchoolsClasses,
  fetchSchoolsTerms,
  type SchoolsTimetableSlotRecord,
} from "@/lib/schools/admin-v2";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import {
  LessonFormSheet,
  type LessonBeingMoved,
  type LessonFormValues,
} from "./lesson-form-sheet";
import {
  AutoFillSheet,
  type AutoFillResult,
  type AutoFillValues,
} from "./auto-fill-sheet";
import {
  CopyForwardSheet,
  type CopyForwardResult,
  type CopyForwardValues,
} from "./copy-forward-sheet";

/**
 * The week, as a timetabler reads it.
 *
 * Two viewpoints on the same lessons — by class and by teacher — because
 * "what is Form 2 doing on Tuesday" and "where is Ms Banda at 10:20" are the
 * two questions a timetable is asked, and answering only the first is what
 * makes a school keep a second copy in a spreadsheet.
 *
 * The grid is desktop-only. A week of periods against days does not survive a
 * 390px screen at a legible size, and shrinking it to fit produces something
 * nobody can read rather than something mobile. Below `lg` the same lessons are
 * a day at a time: pick a day, read the list down. That is genuinely how a
 * phone is used on the way to a lesson.
 */

/** Monday to Friday. Weekend columns appear only if something is scheduled. */
const WEEKDAYS = [1, 2, 3, 4, 5];

type Viewpoint = "class" | "teacher";

const VIEWPOINT_OPTIONS = [
  { value: "class", label: "By class" },
  { value: "teacher", label: "By teacher" },
];

function todayIsoDay() {
  // `getDay()` is 0-6 with Sunday first; the timetable is ISO 1-7 with Monday
  // first, which is also how a school talks about its week.
  const day = new Date().getDay();
  return day === 0 ? 7 : day;
}

function describeSlot(slot: SchoolsTimetableSlotRecord) {
  return {
    className: [slot.classSubject.class.name, slot.classSubject.stream?.name]
      .filter(Boolean)
      .join(" "),
    subject: slot.classSubject.subject.name,
    teacher: slot.classSubject.teacherProfile.user.name ?? "Unassigned",
    room: slot.room?.name ?? null,
  };
}

export function SchoolsTimetableContent() {
  const queryClient = useQueryClient();

  const access = useSchoolAccess();

  const [viewpoint, setViewpoint] = useState<Viewpoint>("class");
  const [classFilter, setClassFilter] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [termFilter, setTermFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [selectedDay, setSelectedDay] = useState(todayIsoDay());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moving, setMoving] = useState<LessonBeingMoved | null>(null);
  const [sheetDefaults, setSheetDefaults] = useState({ dayOfWeek: 1, periodId: "" });
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyResult, setCopyResult] = useState<CopyForwardResult | null>(null);
  const [autoFillOpen, setAutoFillOpen] = useState(false);
  const [autoFillError, setAutoFillError] = useState<string | null>(null);
  const [autoFillResult, setAutoFillResult] = useState<AutoFillResult | null>(null);

  const timetableQuery = useQuery({
    queryKey: [
      "schools",
      "timetable",
      viewpoint,
      classFilter,
      teacherFilter,
      termFilter,
      roomFilter,
    ],
    queryFn: () =>
      fetchSchoolsTimetable({
        classId: viewpoint === "class" && classFilter ? classFilter : undefined,
        teacherProfileId:
          viewpoint === "teacher" && teacherFilter ? teacherFilter : undefined,
        // Term and room narrow both viewpoints. A timetabler asked "what is in
        // Lab 1 on Wednesday" is not asking about a class or a teacher, and
        // before this the only way to answer it was to read the whole grid.
        termId: termFilter || undefined,
        roomId: roomFilter || undefined,
      }),
  });
  const classesQuery = useQuery({
    queryKey: ["schools", "timetable", "classes"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const teachersQuery = useQuery({
    queryKey: ["schools", "timetable", "teachers"],
    queryFn: () => fetchTeacherProfiles({ page: 1, limit: 200, isActive: true }),
  });
  const roomsQuery = useQuery({
    queryKey: ["schools", "timetable", "rooms"],
    queryFn: () => fetchSchoolsRooms({ page: 1, limit: 200, isActive: true }),
  });
  const assignmentsQuery = useQuery({
    queryKey: ["schools", "timetable", "assignments"],
    queryFn: () => fetchTeacherAssignments({ page: 1, limit: 400 }),
  });
  const periodsQuery = useQuery({
    queryKey: ["schools", "timetable", "periods"],
    queryFn: () => fetchSchoolsPeriods({ page: 1, limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "timetable", "terms"],
    queryFn: () => fetchSchoolsTerms({ page: 1, limit: 100 }),
  });

  const timetable = timetableQuery.data;
  const slots = useMemo(() => timetable?.slots ?? [], [timetable]);
  const periods = useMemo(
    () => timetable?.periods ?? periodsQuery.data?.data ?? [],
    [timetable, periodsQuery.data],
  );
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const teachers = useMemo(() => teachersQuery.data?.data ?? [], [teachersQuery.data]);
  const rooms = useMemo(() => roomsQuery.data?.data ?? [], [roomsQuery.data]);
  const assignments = useMemo(
    () => assignmentsQuery.data?.data ?? [],
    [assignmentsQuery.data],
  );
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);

  /** Weekend columns only when the school actually teaches then. */
  const days = useMemo(() => {
    const scheduled = new Set(slots.map((slot) => slot.dayOfWeek));
    const weekend = [6, 7].filter((day) => scheduled.has(day));
    return [...WEEKDAYS, ...weekend];
  }, [slots]);

  const byDayAndPeriod = useMemo(() => {
    const map = new Map<string, SchoolsTimetableSlotRecord[]>();
    for (const slot of slots) {
      const key = `${slot.dayOfWeek}:${slot.periodId}`;
      const existing = map.get(key);
      if (existing) existing.push(slot);
      else map.set(key, [slot]);
    }
    return map;
  }, [slots]);

  /**
   * What the band says: how full the week is, and whether it is legal.
   *
   * The cell count is only a denominator worth printing when one class or one
   * teacher is in view — "15 of 20" for Form 2A means something, the same sum
   * across the whole school does not — so it is stated as a bare count when
   * nothing is chosen.
   */
  const placement = useMemo(() => {
    const teaching = periods.filter((period) => period.isTeaching);
    const cells = teaching.length * days.length;
    const narrowed =
      (viewpoint === "class" && classFilter) ||
      (viewpoint === "teacher" && teacherFilter);

    // A clash is two lessons on the same teacher or in the same room at the
    // same time. The API refuses to create one, so a number here above zero is
    // data that drifted — an imported timetable, or a room merged since — and
    // that is exactly when a timetabler needs to be told.
    const seen = new Map<string, number>();
    let clashes = 0;
    for (const slot of slots) {
      const at = `${slot.dayOfWeek}:${slot.periodId}`;
      for (const who of [
        `t:${slot.classSubject.teacherProfile.id}@${at}`,
        slot.room ? `r:${slot.room.id}@${at}` : null,
      ]) {
        if (!who) continue;
        const count = (seen.get(who) ?? 0) + 1;
        seen.set(who, count);
        if (count === 2) clashes += 1;
      }
    }

    return {
      placed: slots.length,
      cells: narrowed ? cells : null,
      free: narrowed ? Math.max(cells - slots.length, 0) : null,
      clashes,
    };
  }, [slots, periods, days, viewpoint, classFilter, teacherFilter]);

  const daySlots = useMemo(
    () =>
      slots
        .filter((slot) => slot.dayOfWeek === selectedDay)
        .sort((a, b) => a.period.sequence - b.period.sequence),
    [slots, selectedDay],
  );

  const addLesson = useMutation({
    mutationFn: async (values: LessonFormValues) =>
      fetchJson("/api/v2/schools/timetable", {
        method: "POST",
        body: JSON.stringify({
          classSubjectId: values.classSubjectId,
          periodId: values.periodId,
          dayOfWeek: values.dayOfWeek,
          roomId: values.roomId || undefined,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      setSheetOpen(false);
      setSubmitError(null);
    },
    onError: (error) => setSubmitError(getApiErrorMessage(error)),
  });

  const moveLesson = useMutation({
    mutationFn: async (values: LessonFormValues) =>
      fetchJson(`/api/v2/schools/timetable/${moving?.id ?? ""}`, {
        method: "PATCH",
        body: JSON.stringify({
          periodId: values.periodId,
          dayOfWeek: values.dayOfWeek,
          roomId: values.roomId || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      setMoving(null);
      setSubmitError(null);
    },
    onError: (error) => setSubmitError(getApiErrorMessage(error)),
  });

  const removeLesson = useMutation({
    mutationFn: async (slotId: string) =>
      fetchJson(`/api/v2/schools/timetable/${slotId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
    },
  });

  const copyForward = useMutation({
    mutationFn: async (values: CopyForwardValues) =>
      fetchJson<CopyForwardResult>("/api/v2/schools/timetable/copy-forward", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: (result) => {
      // The sheet stays open holding the counts. Closing on success would hide
      // "12 lessons skipped, the target term has no assignment for them",
      // which is the part the timetabler has to act on.
      queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      setCopyResult(result);
      setCopyError(null);
    },
    onError: (error) => {
      setCopyResult(null);
      setCopyError(getApiErrorMessage(error));
    },
  });

  const autoFill = useMutation({
    mutationFn: async (values: AutoFillValues) =>
      fetchJson<AutoFillResult>("/api/v2/schools/timetable/auto-fill", {
        method: "POST",
        body: JSON.stringify({
          classId: values.classId || undefined,
          days: values.days,
          periodsPerSubject: values.periodsPerSubject,
        }),
      }),
    onSuccess: (result) => {
      // Held open on purpose, like copy-forward: "9 assignments could not be
      // given a full week" is the part the timetabler has to act on, and
      // closing the sheet would throw it away.
      queryClient.invalidateQueries({ queryKey: ["schools", "timetable"] });
      setAutoFillResult(result);
      setAutoFillError(null);
    },
    onError: (error) => {
      setAutoFillResult(null);
      setAutoFillError(getApiErrorMessage(error));
    },
  });

  function openSheet(dayOfWeek: number, periodId: string) {
    setSubmitError(null);
    setSheetDefaults({ dayOfWeek, periodId });
    setSheetOpen(true);
  }

  function openMove(slot: SchoolsTimetableSlotRecord) {
    const described = describeSlot(slot);
    setSubmitError(null);
    setMoving({
      id: slot.id,
      describe: [described.subject, described.className, described.teacher]
        .filter(Boolean)
        .join(" · "),
      periodId: slot.periodId,
      dayOfWeek: slot.dayOfWeek,
      roomId: slot.room?.id ?? "",
    });
  }

  if (timetableQuery.error) {
    return (
      <LoadError
        what="the timetable"
        error={timetableQuery.error}
        onRetry={() => void timetableQuery.refetch()}
      />
    );
  }

  const teachingPeriods = periods.filter((period) => period.isTeaching);
  const firstTeachingPeriodId = teachingPeriods[0]?.id ?? "";

  // Build and copy-forward both write dozens of lessons at once, so they need
  // the same grant a single lesson does. Disabled with the reason on them, like
  // every other campus verb — a timetabler who cannot see the button today
  // wonders where yesterday's went.
  const canBuild = access.can("schools.academics", "create");
  const buildReason = canBuild ? undefined : "This is a school administrator to do.";

  return (
    <div className="space-y-4">
      <PageBand
        chips={[
          {
            label: "Lessons placed",
            value:
              placement.cells === null
                ? placement.placed
                : `${placement.placed} of ${placement.cells}`,
            tone: "brand",
          },
          {
            label: "Free periods",
            value: placement.free === null ? "—" : placement.free,
          },
          {
            label: "Clashes",
            value: placement.clashes,
            tone: placement.clashes > 0 ? "danger" : "success",
          },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section-title">The week</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={!canBuild || periods.length === 0 || assignments.length === 0}
            title={buildReason}
            onClick={() => {
              setAutoFillError(null);
              setAutoFillResult(null);
              setAutoFillOpen(true);
            }}
          >
            Build timetable
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!canBuild || terms.length < 2}
            title={
              buildReason ??
              (terms.length < 2
                ? "There is only one term to copy from."
                : undefined)
            }
            onClick={() => {
              setCopyError(null);
              setCopyResult(null);
              setCopyOpen(true);
            }}
          >
            Copy forward
          </Button>
          <CreateButton
            resource="schools.academics"
            label="Add lesson"
            unavailable={
              periods.length === 0
                ? "Set the school day up first — a lesson needs a period to sit in."
                : assignments.length === 0
                  ? "No class-subject assignments exist for this term yet."
                  : undefined
            }
            onSelect={() => openSheet(selectedDay, firstTeachingPeriodId)}
          />
        </div>
      </div>

      {periods.length === 0 ? (
        <Alert
          tone="warn"
          title="No periods yet"
          actions={
            <Button asChild variant="secondary" size="sm">
              <Link href="/management/master-data/schools/periods">
                Set the school day up
              </Link>
            </Button>
          }
        >
          A timetable is a grid of days against periods, and this school has no
          periods. Set the school day up under Master data before adding lessons.
        </Alert>
      ) : null}

      <FilterBar>
        <FilterSelect
          label="Show"
          allLabel="By class"
          value={viewpoint === "class" ? "" : viewpoint}
          options={VIEWPOINT_OPTIONS}
          onChange={(value) => setViewpoint((value || "class") as Viewpoint)}
        />
        {viewpoint === "class" ? (
          <FilterSelect
            label="Class"
            allLabel="Every year group"
            value={classFilter}
            options={classes.map((schoolClass) => ({
              value: schoolClass.id,
              label: schoolClass.name,
            }))}
            onChange={setClassFilter}
          />
        ) : (
          <FilterSelect
            label="Teacher"
            allLabel="Every teacher"
            value={teacherFilter}
            options={teachers.map((teacher) => ({
              value: teacher.id,
              label: teacher.user.name,
            }))}
            onChange={setTeacherFilter}
          />
        )}
        <FilterSelect
          label="Term"
          allLabel="The current term"
          value={termFilter}
          options={terms.map((term) => ({
            value: term.id,
            label: `${term.name} · ${term.academicYear.name}${term.isActive ? " (current)" : ""}`,
          }))}
          onChange={setTermFilter}
        />
        <FilterSelect
          label="Room"
          allLabel="Every room"
          value={roomFilter}
          options={rooms.map((room) => ({ value: room.id, label: room.name }))}
          onChange={setRoomFilter}
        />
      </FilterBar>

      {/* Phone and tablet: one day at a time. */}
      <div className="space-y-2 lg:hidden">
        <FilterBar>
          <FilterSelect
            label="Day"
            allLabel={DAY_NAMES[selectedDay]}
            value={String(selectedDay)}
            options={days.map((day) => ({ value: String(day), label: DAY_NAMES[day] }))}
            onChange={(value) => setSelectedDay(Number(value) || selectedDay)}
          />
        </FilterBar>
        <MobileList>
          {daySlots.length === 0 ? (
            <MobileListEmpty>
              {timetableQuery.isLoading
                ? "Loading the timetable…"
                : `Nothing scheduled on ${DAY_NAMES[selectedDay]}.`}
            </MobileListEmpty>
          ) : (
            daySlots.map((slot) => {
              const described = describeSlot(slot);
              return (
                <MobileList.Row
                  key={slot.id}
                  static
                  title={`${described.subject} · ${described.className}`}
                  subtitle={[
                    `${formatMinute(slot.period.startMinute)}–${formatMinute(slot.period.endMinute)}`,
                    described.teacher,
                    described.room,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
              );
            })
          )}
        </MobileList>
      </div>

      {/* Desktop: the whole week at once. */}
      <div className="hidden lg:block">
        <div className="table-rail table-scroll">
          <div
            className="grid min-w-[900px] gap-px bg-[var(--border-subtle)]"
            style={{
              gridTemplateColumns: `minmax(140px, 1fr) repeat(${days.length}, minmax(150px, 1fr))`,
            }}
          >
            <div className="bg-[var(--surface-muted)] p-2 text-sm font-semibold text-muted-foreground">
              Period
            </div>
            {days.map((day) => (
              <div
                key={day}
                className="bg-[var(--surface-muted)] p-2 text-sm font-semibold text-muted-foreground"
              >
                {DAY_NAMES[day]}
              </div>
            ))}

            {periods.map((period) => (
              <Fragment key={period.id}>
                <div className="bg-[var(--surface)] p-2">
                  <div className="text-sm font-medium">{period.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatMinute(period.startMinute)}–{formatMinute(period.endMinute)}
                  </div>
                </div>
                {days.map((day) => {
                  const cellSlots = byDayAndPeriod.get(`${day}:${period.id}`) ?? [];
                  return (
                    <div key={`${day}:${period.id}`} className="bg-[var(--surface)] p-2">
                      {!period.isTeaching ? (
                        <span className="text-sm text-muted-foreground">
                          {period.name}
                        </span>
                      ) : cellSlots.length === 0 ? (
                        <button
                          type="button"
                          className="w-full rounded-md border border-dashed border-[var(--edge-subtle)] p-2 text-sm text-muted-foreground hover:bg-[var(--surface-muted)]"
                          onClick={() => openSheet(day, period.id)}
                        >
                          Add
                        </button>
                      ) : (
                        <div className="space-y-1">
                          {cellSlots.map((slot) => {
                            const described = describeSlot(slot);
                            return (
                              <div
                                key={slot.id}
                                className="rounded-md border border-[var(--edge-subtle)] p-2"
                              >
                                <div className="text-sm font-medium">
                                  {described.subject}
                                </div>
                                {/* Both, always. Showing only the teacher in
                                    the class view left a cell holding three
                                    classes' lessons with nothing saying which
                                    class each belonged to. */}
                                <div className="text-sm text-muted-foreground">
                                  {described.className}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {described.teacher}
                                </div>
                                {described.room ? (
                                  <Badge tone="neutral">{described.room}</Badge>
                                ) : null}
                                <RecordActions
                                  resource="schools.academics"
                                  verbs={[
                                    {
                                      label: "Move",
                                      action: "edit",
                                      onSelect: () => openMove(slot),
                                    },
                                    {
                                      label: "Remove",
                                      action: "archive",
                                      tone: "danger",
                                      loading:
                                        removeLesson.isPending &&
                                        removeLesson.variables === slot.id,
                                      // Every other destructive action in
                                      // campus confirms; this one deleted on a
                                      // single tap in a grid of twenty-five
                                      // cells, with no undo behind it.
                                      confirm: {
                                        title: `Remove ${described.subject} from ${DAY_NAMES[day]}`,
                                        description: `${described.className} loses this lesson in ${period.name}. The class-subject assignment stays; only the slot on the timetable goes, and it has to be placed again by hand.`,
                                        confirmLabel: "Remove the lesson",
                                      },
                                      onSelect: () => removeLesson.mutate(slot.id),
                                    },
                                  ]}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </div>

      <LessonFormSheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSubmitError(null);
        }}
        assignments={assignments}
        periods={periods}
        rooms={rooms}
        defaultDayOfWeek={sheetDefaults.dayOfWeek}
        defaultPeriodId={sheetDefaults.periodId || firstTeachingPeriodId}
        isSubmitting={addLesson.isPending}
        error={submitError}
        onSubmit={(values) => addLesson.mutate(values)}
      />

      {/* Mounted only while a lesson is being moved, so the sheet opens holding
          that lesson's day, period and room rather than the last one's. */}
      {moving ? (
        <LessonFormSheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setMoving(null);
              setSubmitError(null);
            }
          }}
          assignments={assignments}
          periods={periods}
          rooms={rooms}
          defaultDayOfWeek={moving.dayOfWeek}
          defaultPeriodId={moving.periodId}
          moving={moving}
          isSubmitting={moveLesson.isPending}
          error={submitError}
          onSubmit={(values) => moveLesson.mutate(values)}
        />
      ) : null}

      <AutoFillSheet
        open={autoFillOpen}
        onOpenChange={(open) => {
          setAutoFillOpen(open);
          if (!open) {
            setAutoFillError(null);
            setAutoFillResult(null);
          }
        }}
        classes={classes}
        isSubmitting={autoFill.isPending}
        error={autoFillError}
        result={autoFillResult}
        onSubmit={(values) => autoFill.mutate(values)}
      />

      <CopyForwardSheet
        open={copyOpen}
        onOpenChange={(open) => {
          setCopyOpen(open);
          if (!open) {
            setCopyError(null);
            setCopyResult(null);
          }
        }}
        terms={terms}
        currentTermId={timetable?.termId ?? null}
        isSubmitting={copyForward.isPending}
        error={copyError}
        result={copyResult}
        onSubmit={(values) => copyForward.mutate(values)}
      />
    </div>
  );
}
