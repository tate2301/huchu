"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Button, MobileList, MobileListEmpty } from "@corelithzw/react";

import { EntityLink } from "@/components/records/entity-link";
import { RecordMark } from "@/components/records/record-mark";

import { PageChrome } from "@/components/layout/page-chrome";

import { SchoolsPage } from "@/components/schools/common/schools-page";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/records/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import { Plus } from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import { cn } from "@/lib/utils";
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
import { TableControls, TableSearch } from "@/components/records/table-controls";
import {
  LessonFormSheet,
  type LessonBeingMoved,
  type LessonFormValues,
} from "@/components/schools/timetable/lesson-form-sheet";
import {
  AutoFillSheet,
  type AutoFillResult,
  type AutoFillValues,
} from "@/components/schools/timetable/auto-fill-sheet";
import {
  CopyForwardSheet,
  type CopyForwardResult,
  type CopyForwardValues,
} from "@/components/schools/timetable/copy-forward-sheet";

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
 * nobody can read rather than something mobile. So the artboard draws two
 * shapes for the same lessons and the breakpoint between them is lg: at and
 * above it, the whole week as a grid; below lg, one day at a time — pick a
 * day, read the list down. That is genuinely how a phone is used on the way to
 * a lesson.
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
  const [subjectFilter, setSubjectFilter] = useState("");
  /** Which day the desktop grid is narrowed to. Empty means the whole week. */
  const [dayFilter, setDayFilter] = useState("");
  const [search, setSearch] = useState("");
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
  const allSlots = useMemo(() => timetable?.slots ?? [], [timetable]);

  /**
   * The subjects actually on this week, rather than the whole catalogue.
   *
   * Offering a subject the timetable does not contain can only ever empty the
   * grid, and a timetabler narrowing to "Combined Science" wants the four
   * lessons of it, not a dropdown of twenty-two.
   */
  const subjectOptions = useMemo(
    () => [
      ...new Map(
        allSlots.map((slot) => [
          slot.classSubject.subject.id,
          { value: slot.classSubject.subject.id, label: slot.classSubject.subject.name },
        ]),
      ).values(),
    ].sort((a, b) => a.label.localeCompare(b.label)),
    [allSlots],
  );

  /**
   * Subject and the search box narrow in the browser rather than at the API.
   *
   * The week is already in hand — a term's worth of one class is tens of rows,
   * not thousands — and a round trip per keystroke would make the grid blink
   * on every letter. Everything that changes *which* week is fetched (class,
   * teacher, term, room) stays in the query key above.
   */
  const slots = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allSlots.filter((slot) => {
      if (subjectFilter && slot.classSubject.subject.id !== subjectFilter) return false;
      if (!needle) return true;
      const described = describeSlot(slot);
      return [described.subject, described.className, described.teacher, described.room]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [allSlots, subjectFilter, search]);
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

  /**
   * Weekend columns only when the school actually teaches then.
   *
   * Read off the unfiltered week: narrowing to one subject must not make
   * Saturday's column disappear from the Day picker while a Saturday lesson
   * still exists.
   */
  const days = useMemo(() => {
    const scheduled = new Set(allSlots.map((slot) => slot.dayOfWeek));
    const weekend = [6, 7].filter((day) => scheduled.has(day));
    return [...WEEKDAYS, ...weekend];
  }, [allSlots]);

  /** The columns the desktop grid draws — the whole week, or the one chosen. */
  const shownDays = useMemo(
    () => (dayFilter ? days.filter((day) => String(day) === dayFilter) : days),
    [days, dayFilter],
  );

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
   * Which lessons are double-booked, and how many collisions that is.
   *
   * A clash is two lessons on the same teacher or in the same room at the same
   * time. The API refuses to create one, so anything here is data that drifted
   * — an imported timetable, or a room merged since — and that is exactly when
   * a timetabler needs to be told.
   *
   * The cells holding them are drawn in the danger tone with the reason on
   * them: a figure you cannot act on is a figure you learn to ignore.
   */
  const clashes = useMemo(() => {
    const at = new Map<string, string[]>();
    for (const slot of allSlots) {
      const when = `${slot.dayOfWeek}:${slot.periodId}`;
      for (const who of [
        `t:${slot.classSubject.teacherProfile.id}@${when}`,
        slot.room ? `r:${slot.room.id}@${when}` : null,
      ]) {
        if (!who) continue;
        at.set(who, [...(at.get(who) ?? []), slot.id]);
      }
    }

    const slotIds = new Set<string>();
    let count = 0;
    for (const booked of at.values()) {
      if (booked.length < 2) continue;
      count += 1;
      for (const id of booked) slotIds.add(id);
    }
    return { count, slotIds };
  }, [allSlots]);

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

  // A bulk write is in flight over the same grid the timetabler is reading.
  // Auto-fill places dozens of lessons and copy-forward duplicates a whole
  // term, so the week dims and stops taking clicks until they land.
  const bulkWriting = autoFill.isPending || copyForward.isPending;

  const anyFilter = Boolean(
    (viewpoint === "class" && classFilter) ||
      (viewpoint === "teacher" && teacherFilter) ||
      termFilter ||
      roomFilter ||
      subjectFilter ||
      search.trim(),
  );

  // The narrowing in the timetabler's own words, for when it emptied the week.
  const narrowed = [
    viewpoint === "class"
      ? classes.find((row) => row.id === classFilter)?.name
      : teachers.find((row) => row.id === teacherFilter)?.user.name,
    terms.find((row) => row.id === termFilter)?.name,
    rooms.find((row) => row.id === roomFilter)?.name,
    subjectOptions.find((option) => option.value === subjectFilter)?.label,
    search.trim() || null,
  ].filter((value): value is string => Boolean(value));

  const clearFilters = () => {
    setClassFilter("");
    setTeacherFilter("");
    setTermFilter("");
    setRoomFilter("");
    setSubjectFilter("");
    setSearch("");
  };

  // Build and copy-forward both write dozens of lessons at once, so they need
  // the same grant a single lesson does. Disabled with the reason on them, like
  // every other campus verb — a timetabler who cannot see the button today
  // wonders where yesterday's went.
  const canBuild = access.can("schools.academics", "create");
  const buildReason = canBuild ? undefined : "This is a school administrator to do.";

  return (
    <SchoolsPage>
      {/* The page is named once, in the app bar. "The week" as a heading under
          a bar that already says Timetable spent a band of vertical space on
          nothing, and the rule that band drew was the seam. */}
      <PageChrome title="Timetable">
        {/* The two bulk writes sit beside the one verb a timetabler presses
            all afternoon. They act on the whole week, so they belong in the
            app bar with it rather than over the grid they rewrite. */}
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
          Build the week
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={!canBuild || terms.length < 2}
          title={
            buildReason ??
            (terms.length < 2 ? "There is only one term to copy from." : undefined)
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
      </PageChrome>

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

      {/* The canvas's law: the controls that govern the grid sit in one row
          directly above it — the viewpoint, the search box and every filter. */}
      <TableControls
        search={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder="Search lessons"
          />
        }
        filters={
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
        {/* Only once there is more than one subject on the week. A dropdown
            holding a single option is a control that cannot do anything. */}
        {subjectOptions.length > 1 ? (
          <FilterSelect
            label="Subject"
            allLabel="Every subject"
            value={subjectFilter}
            options={subjectOptions}
            onChange={setSubjectFilter}
          />
        ) : null}
        {/* The whole week is the desktop default and the thing worth being
            able to get back to; picking a day drops the grid to that column,
            which is how a timetabler checks Tuesday against a room booking. */}
        <FilterSelect
          label="Day"
          allLabel="The whole week"
          value={dayFilter}
          options={days.map((day) => ({ value: String(day), label: DAY_NAMES[day] }))}
          onChange={setDayFilter}
        />
          </FilterBar>
        }
      />

      {/* The reminder that a bulk write failed halfway. Auto-fill and
          copy-forward hold their own detail in their sheets; these are for the
          single-lesson verbs, which have no sheet left open to say it in. */}
      {removeLesson.error ? (
        <SaveError what="The lesson" error={removeLesson.error} />
      ) : null}

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
        {timetableQuery.isPending ? (
          // Cards rather than table rows: the phone view is a stack of lessons,
          // not a grid, so the placeholder has to be the shape it becomes.
          <CardsSkeleton count={5} columns={1} lines={2} />
        ) : daySlots.length === 0 ? (
          slots.length === 0 && !anyFilter ? (
            <NothingYet
              title="Nothing on the timetable yet"
              body={
                "A lesson is a class-subject placed in a period on a day — " +
                "Mathematics first thing Monday, Shona on Friday, Geography and " +
                "Physical Education wherever the field is free. Add the first one " +
                "and the week starts filling in."
              }
            />
          ) : anyFilter ? (
            <NothingMatched
              what="lessons"
              filters={[...narrowed, DAY_NAMES[selectedDay]]}
              onClear={clearFilters}
            />
          ) : (
            <MobileList>
              <MobileListEmpty>
                Nothing scheduled on {DAY_NAMES[selectedDay]}.
              </MobileListEmpty>
            </MobileList>
          )
        ) : (
          <SavingOverlay saving={bulkWriting} label="Placing lessons…">
            <MobileList>
              {daySlots.map((slot) => {
                const described = describeSlot(slot);
                return (
                  <MobileList.Row
                    key={slot.id}
                    static
                    leading={<RecordMark kind="subject" name={described.subject} size="sm" />}
                    title={`${described.subject} · ${described.className}`}
                    // The time leads: a phone is read on the way to a lesson,
                    // and the question it is being asked is "what is next".
                    subtitle={[
                      `${formatMinute(slot.period.startMinute)}–${formatMinute(slot.period.endMinute)}`,
                      described.teacher,
                      described.room,
                      clashes.slotIds.has(slot.id) ? "Double-booked" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                );
              })}
            </MobileList>
          </SavingOverlay>
        )}
      </div>

      {/* Desktop: the whole week at once. */}
      <div className="hidden lg:block">
        {timetableQuery.isPending ? (
          // The grid's own shape: a period label per row, one bar per weekday.
          // A generic block here made the whole week jump when the slots landed.
          <TableRowsSkeleton
            headers={["Period", ...shownDays.map((day) => DAY_NAMES[day])]}
            columns={[{ twoLine: true }, ...shownDays.map(() => ({}))]}
            rows={7}
          />
        ) : slots.length === 0 && anyFilter ? (
          <NothingMatched what="lessons" filters={narrowed} onClear={clearFilters} />
        ) : allSlots.length === 0 ? (
          // Previously an empty twenty-five-cell grid of "Add" buttons, which
          // reads as a broken page rather than a week nobody has laid out yet.
          <NothingYet
            title="Nothing on the timetable yet"
            body={
              "A lesson is a class-subject placed in a period on a day. Build the " +
              "week in one press, or place the first lesson by hand."
            }
          />
        ) : (
          <SavingOverlay saving={bulkWriting} label="Placing lessons…">
            <div className="table-rail table-scroll">
              <div
                className="grid min-w-[900px] gap-px bg-[var(--border-subtle)]"
                style={{
                  gridTemplateColumns: `minmax(140px, 1fr) repeat(${shownDays.length}, minmax(150px, 1fr))`,
                }}
              >
                <div className="bg-[var(--surface-muted)] px-2 py-1.5 text-sm font-medium text-[color:var(--text-muted)]">
                  Period
                </div>
                {shownDays.map((day) => (
                  <div
                    key={day}
                    className="bg-[var(--surface-muted)] px-2 py-1.5 text-sm font-medium text-[color:var(--text-muted)]"
                  >
                    {DAY_NAMES[day]}
                  </div>
                ))}

                {periods.map((period) => (
                  <Fragment key={period.id}>
                    <div className="bg-[var(--surface)] px-2 py-1.5">
                      <div className="text-sm font-medium text-[color:var(--text-strong)]">
                        {period.name}
                      </div>
                      <div className="font-mono text-sm tabular-nums text-[color:var(--text-subtle)]">
                        {formatMinute(period.startMinute)}–{formatMinute(period.endMinute)}
                      </div>
                    </div>

                    {/* Break and lunch run across the week rather than
                        repeating their own name in every column. Five cells
                        each saying "Break" is the row label read five more
                        times, and it gave a non-teaching row the same weight
                        as a row with five lessons in it. */}
                    {!period.isTeaching ? (
                      <div
                        className="bg-[var(--surface-muted)] px-2 py-1.5 text-sm text-[color:var(--text-subtle)]"
                        style={{ gridColumn: `span ${shownDays.length}` }}
                      >
                        Not taught
                      </div>
                    ) : (
                      shownDays.map((day) => {
                        const cellSlots = byDayAndPeriod.get(`${day}:${period.id}`) ?? [];
                        return (
                          <div key={`${day}:${period.id}`} className="bg-[var(--surface)] p-1">
                            {cellSlots.length === 0 ? (
                              /* A free period is the quietest thing on the
                                 grid, not twenty-five dashed boxes saying
                                 "Add". The whole cell is the target and the
                                 plus only appears under the pointer; the
                                 accessible name says which cell it is, because
                                 twenty-five controls called "Add" are
                                 twenty-five controls a keyboard reader cannot
                                 tell apart. */
                              <button
                                type="button"
                                className="group/cell flex h-full min-h-11 w-full items-center justify-center rounded-[var(--radius-md)] text-[color:var(--text-faint)] transition-colors hover:bg-[var(--surface-muted)] focus-visible:bg-[var(--surface-muted)]"
                                onClick={() => openSheet(day, period.id)}
                              >
                                <Plus
                                  className="size-4 opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100"
                                  aria-hidden="true"
                                />
                                <span className="sr-only">
                                  Add a lesson — {DAY_NAMES[day]}, {period.name}
                                </span>
                              </button>
                            ) : (
                              <div className="space-y-1">
                                {cellSlots.map((slot) => {
                                  const described = describeSlot(slot);
                                  const clashing = clashes.slotIds.has(slot.id);
                                  return (
                                    <div
                                      key={slot.id}
                                      className={cn(
                                        "flex items-start gap-1 rounded-[var(--radius-md)] border px-2 py-1.5",
                                        clashing
                                          ? "border-[color:var(--tone-danger)] bg-[color:var(--tone-danger-soft)]"
                                          : "border-[color:var(--border-subtle)]",
                                      )}
                                      title={
                                        clashing
                                          ? "Double-booked — the same teacher or room is in two lessons at this time."
                                          : undefined
                                      }
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-[color:var(--text-strong)]">
                                          <EntityLink
                                            href={recordType("SUBJECT").href(
                                              slot.classSubject.subject.id,
                                            )}
                                          >
                                            {described.subject}
                                          </EntityLink>
                                        </div>
                                        {/* Both, always. Showing only the
                                            teacher in the class view left a
                                            cell holding three classes' lessons
                                            with nothing saying which class each
                                            belonged to. */}
                                        <div className="truncate text-sm text-[color:var(--text-muted)]">
                                          <EntityLink
                                            href={recordType("CLASS").href(
                                              slot.classSubject.class.id,
                                            )}
                                            muted
                                          >
                                            {described.className}
                                          </EntityLink>
                                        </div>
                                        {/* The teacher and the room on one mono
                                            line: they are what the eye runs
                                            down a column looking for, and at
                                            the subject's size and face they
                                            read as three subjects stacked. */}
                                        <div className="truncate font-mono text-sm text-[color:var(--text-subtle)]">
                                          <EntityLink
                                            href={recordType("TEACHER").href(
                                              slot.classSubject.teacherProfile.id,
                                            )}
                                            muted
                                          >
                                            {described.teacher}
                                          </EntityLink>
                                          {described.room ? ` · ${described.room}` : ""}
                                        </div>
                                        {clashing ? (
                                          <span className="mt-1 inline-block rounded-[var(--radius-sm)] bg-[color:var(--tone-danger-soft)] px-1.5 text-sm font-medium text-[color:var(--tone-danger)]">
                                            Double-booked
                                          </span>
                                        ) : null}
                                      </div>
                                      {/* A menu, not two buttons. "Move" and
                                          "Remove" spelled out came to about
                                          120px of a cell that is 150px wide,
                                          so the lesson underneath them had
                                          nowhere to be. */}
                                      <RecordActions
                                        layout="menu"
                                        label={`Lesson actions for ${described.subject}, ${described.className}, ${DAY_NAMES[day]} ${period.name}`}
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
                                            // campus confirms; this one deleted
                                            // on a single tap in a grid of
                                            // twenty-five cells, with no undo
                                            // behind it.
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
                      })
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          </SavingOverlay>
        )}
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
    </SchoolsPage>
  );
}
