"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  StatCard,
} from "@corelithzw/react";

import { PageChrome } from "@/components/layout/page-chrome";
import { ClassFilter, type ClassFilterValue } from "@/components/schools/common/class-filter";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { PageBand } from "@/components/schools/common/page-band";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { CreateButton, RecordActions } from "@/components/schools/common/record-actions";
import { SendNoticeDialog } from "@/components/schools/common/send-notice-dialog";
import { TableControls, TableSearch } from "@/components/schools/common/table-controls";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
} from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fetchSchoolsTerms, fetchTeacherProfiles } from "@/lib/schools/admin-v2";
import {
  BookSlotDialog,
  type BookSlotValues,
} from "@/components/schools/meetings/book-slot-dialog";
import {
  EveningsPanel,
  type Evening,
} from "@/components/schools/meetings/evenings-panel";
import {
  OpenSlotsDialog,
  type OpenSlotsForm,
} from "@/components/schools/meetings/open-slots-dialog";
import { printEvening } from "@/components/schools/meetings/print-evening";

/**
 * Parent meetings, from the office.
 *
 * A parents' evening is a whole-school event and every screen that existed for
 * it was one teacher's. A teacher can open their own evening and see their own
 * bookings; nobody could see the school's, which is the view the office needs —
 * to open Thursday for a dozen staff at once, to answer "has anyone booked Mr
 * Moyo", and to free the 17:30 when a family rings to cancel.
 *
 * The term is the window rather than a date, because that is the unit the
 * office thinks in and a parents' evening is not always one night. Free slots
 * are rows here exactly as they are in the portal: the point of the model is
 * that an unbooked ten minutes is a thing, and the office's most common
 * question — where is there still room — cannot be answered by a list of
 * bookings.
 *
 * ── Where the controls live ────────────────────────────────────────────────
 *
 * The term, the teacher, the year group, the evening and the search box are one
 * row above the schedule they narrow, because they narrow the schedule and
 * nothing else. The band above keeps the three counts that do not move when you
 * type — slots open, booked, free — and the one create verb sits in the app bar
 * where every other campus page keeps its primary action.
 *
 * The canvas names that row as four filters and their unnarrowed choice:
 *
 *   Term = The current term
 *   Teacher = Every teacher
 *   Year group = Every year group
 *   Evening = Every evening
 *
 * Each pair below is that contract: the `label` and the `allLabel` handed to
 * the control, so a reader can put the artboard beside the code and check.
 *
 * ── Releasing a slot ───────────────────────────────────────────────────────
 *
 * "Nobody is told automatically — ring them." That is the release dialog
 * verbatim, and it is honest. It was also the gap: the school can reach every
 * parent's portal in one send, and a cancelled meeting did not use it. So the
 * offer to write to the family is made after the release rather than folded
 * into the confirmation — freeing a slot for the next family and writing to the
 * last one are two decisions, and a checkbox in a warning dialog is not where
 * the second gets thought about.
 *
 * ── What a booking's CRUD actually is ──────────────────────────────────────
 *
 * The record on this screen is the booking, not the ten minutes. Create is
 * "Book for a family" on a free row, edit is "Change the booking" — the same
 * dialog seeded with who is coming — and delete is "Release", which cancels the
 * meeting and puts the ten minutes back on the list as free. Opening slots is
 * how the evening itself is created, and it is the app bar's verb.
 */

type Slot = {
  id: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  notes: string | null;
  outcome: string | null;
  bookedAt: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    currentClass: { id: string; name: string } | null;
  } | null;
  guardian: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
  } | null;
  teacherProfile: {
    id: string;
    user: { name: string; image: string | null };
  };
};

type Schedule = { slots: Slot[] };

type OpenResult = { created: number; skipped: number };

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD` for a local-time date — the key an evening is grouped on. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "12 March 2026" — day, month, year, no zero padding. */
function formatDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "17:00" — 24-hour, from an instant. */
function formatTime(iso: string) {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "Thu 12 Mar" — the shape a night is named in the evenings list. */
function formatEvening(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  return `${WEEKDAY_SHORT[date.getDay()]} ${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}

/** What a released slot needs so the family can still be told about it. */
type ReleasedSlot = {
  studentId: string;
  who: string;
  when: string;
  teacherName: string;
};

/**
 * "Print her evening", "Print his evening", or neither.
 *
 * The canvas labels the print verb with the teacher's own pronoun — the office
 * hands Mrs Nyathi *her* evening, not "the" evening — and the only thing the
 * school has actually recorded about that is the honorific it wrote into her
 * name. So the honorific is what this reads, and nothing else: there is no
 * gender column on a teacher profile, and inferring one from a first name is
 * how a product starts getting people's pronouns wrong in print.
 *
 * A name with no honorific — "T. Chirwa", a staff list imported without them —
 * gets the neutral label rather than a guess.
 */
function printEveningLabel(teacherName: string) {
  const honorific = teacherName.trim().match(/^(Mrs|Ms|Miss|Mr|Mx)\b\.?/i)?.[1];
  if (!honorific) return "Print the evening";
  const lower = honorific.toLowerCase();
  if (lower === "mr") return "Print his evening";
  if (lower === "mx") return "Print the evening";
  return "Print her evening";
}

/** The row a booking dialog is seeded from, and what it is doing to it. */
type BookingIntent = { slot: Slot; mode: "book" | "edit" };

export function MeetingsAdminContent() {
  const queryClient = useQueryClient();
  const access = useSchoolAccess();

  const [chosenTermId, setChosenTermId] = useState("");
  const [teacherProfileId, setTeacherProfileId] = useState("");
  const [yearGroup, setYearGroup] = useState<ClassFilterValue>({
    classId: "",
    streamId: "",
  });
  const [eveningKey, setEveningKey] = useState("");
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState(false);
  const [openResult, setOpenResult] = useState<OpenResult | null>(null);
  const [released, setReleased] = useState<string | null>(null);
  const [freedFamily, setFreedFamily] = useState<ReleasedSlot | null>(null);
  const [tellingFamily, setTellingFamily] = useState(false);
  const [booking, setBooking] = useState<BookingIntent | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [printBlocked, setPrintBlocked] = useState(false);

  const classId = yearGroup.classId;

  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "for-meetings"],
    queryFn: () => fetchSchoolsTerms({ limit: 50 }),
  });
  const teachersQuery = useQuery({
    queryKey: ["schools", "teacher-profiles", "for-meetings"],
    queryFn: () => fetchTeacherProfiles({ limit: 200, isActive: true }),
  });

  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const teachers = teachersQuery.data?.data ?? [];

  /**
   * The term on screen, derived rather than stored: what the office picked, or
   * the running term until they pick. Seeding state from the query would need
   * an effect that fires after the first paint, and the screen would flash an
   * empty term picker on every load.
   */
  const term = useMemo(() => {
    const chosen = terms.find((row) => row.id === chosenTermId);
    return chosen ?? terms.find((row) => row.isActive) ?? terms[0] ?? null;
  }, [terms, chosenTermId]);

  const from = term ? term.startDate.slice(0, 10) : null;
  const to = term ? term.endDate.slice(0, 10) : null;

  const scheduleQuery = useQuery({
    queryKey: ["schools", "meetings", "admin", from, to, teacherProfileId],
    queryFn: () => {
      const params = new URLSearchParams({ from: from!, to: to! });
      if (teacherProfileId) params.set("teacherProfileId", teacherProfileId);
      return fetchJson<Schedule>(`/api/v2/schools/meetings?${params.toString()}`);
    },
    enabled: Boolean(from && to),
  });

  const allSlots = useMemo(() => scheduleQuery.data?.slots ?? [], [scheduleQuery.data]);

  /**
   * The year-group filter narrows the bookings, not the evening.
   *
   * A free slot belongs to no year group — any family can take it — so hiding
   * the free rows when the office asks "who from Form 1 is booked with Ms
   * Banda" would answer a different question and hide the room that is left.
   *
   * The search box works the same way, and for the same reason: it is a pupil
   * or a teacher you are looking for, and a free ten minutes has neither.
   */
  const byYearGroup = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return allSlots.filter((slot) => {
      if (classId && slot.bookedAt && slot.student?.currentClass?.id !== classId) {
        return false;
      }
      if (!needle) return true;
      if (!slot.bookedAt) return true;
      const haystack = [
        slot.student?.firstName,
        slot.student?.lastName,
        slot.student?.studentNo,
        slot.teacherProfile.user.name,
        slot.guardian ? `${slot.guardian.firstName} ${slot.guardian.lastName}` : null,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [allSlots, classId, search]);

  /**
   * The evenings the term holds, counted before the night filter narrows them.
   *
   * The panel is a navigation control, so it has to keep showing the nights you
   * are not on — a calendar that empties down to the one dot you clicked has
   * removed the only way back.
   */
  const evenings = useMemo<Evening[]>(() => {
    const nights = new Map<
      string,
      { teachers: Set<string>; booked: number; slots: number }
    >();
    for (const slot of byYearGroup) {
      const key = dayKey(new Date(slot.startsAt));
      const night =
        nights.get(key) ?? { teachers: new Set<string>(), booked: 0, slots: 0 };
      night.teachers.add(slot.teacherProfile.id);
      night.slots += 1;
      if (slot.bookedAt) night.booked += 1;
      nights.set(key, night);
    }
    return [...nights.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, night]) => ({
        key,
        label: formatEvening(key),
        teachers: night.teachers.size,
        booked: night.booked,
        slots: night.slots,
      }));
  }, [byYearGroup]);

  const slots = eveningKey
    ? byYearGroup.filter((slot) => dayKey(new Date(slot.startsAt)) === eveningKey)
    : byYearGroup;

  const booked = slots.filter((slot) => slot.bookedAt).length;
  const free = slots.length - booked;

  // Teacher, then time. The API already orders by time, so pushing in order
  // keeps each teacher's evening in sequence without a second sort.
  const byTeacher = useMemo(() => {
    const groups = new Map<string, { name: string; image: string | null; slots: Slot[] }>();
    for (const slot of slots) {
      const key = slot.teacherProfile.id;
      const group = groups.get(key) ?? {
        name: slot.teacherProfile.user.name,
        image: slot.teacherProfile.user.image,
        slots: [],
      };
      group.slots.push(slot);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [slots]);

  const openSlots = useMutation({
    mutationFn: (form: OpenSlotsForm) =>
      fetchJson<OpenResult>("/api/v2/schools/meetings", {
        method: "POST",
        body: JSON.stringify({
          action: "open",
          teacherProfileId: form.teacherProfileId,
          from: new Date(`${form.onDate}T${form.startsAt}`).toISOString(),
          to: new Date(`${form.onDate}T${form.endsAt}`).toISOString(),
          minutesEach: form.minutesEach,
          location: form.location.trim() || null,
        }),
      }),
    onSuccess: (result) => {
      setOpenResult(result);
      setReleased(null);
      void queryClient.invalidateQueries({ queryKey: ["schools", "meetings", "admin"] });
    },
  });

  /**
   * Create and edit are one mutation because the API has one verb for both.
   *
   * Changing who is coming means releasing the ten minutes and booking them
   * again — the route refuses to book a slot that is already taken — so the
   * edit does the release first rather than making the office do it and hope
   * nobody else takes the row in between.
   */
  const bookSlot = useMutation({
    mutationFn: async (input: { intent: BookingIntent; values: BookSlotValues }) => {
      if (input.intent.mode === "edit") {
        await fetchJson("/api/v2/schools/meetings", {
          method: "POST",
          body: JSON.stringify({ action: "release", meetingId: input.intent.slot.id }),
        });
      }
      return fetchJson("/api/v2/schools/meetings", {
        method: "POST",
        body: JSON.stringify({
          action: "book",
          meetingId: input.intent.slot.id,
          studentId: input.values.studentId,
          guardianId: input.values.guardianId || null,
          notes: input.values.notes.trim() || null,
        }),
      });
    },
    onSuccess: (_result, input) => {
      const slot = input.intent.slot;
      setBooking(null);
      setOpenResult(null);
      setReleased(
        input.intent.mode === "edit"
          ? `${formatTime(slot.startsAt)} with ${slot.teacherProfile.user.name} has been changed.`
          : `${formatTime(slot.startsAt)} with ${slot.teacherProfile.user.name} is booked.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "meetings", "admin"] });
    },
  });

  const release = useMutation({
    mutationFn: (meetingId: string) =>
      fetchJson("/api/v2/schools/meetings", {
        method: "POST",
        body: JSON.stringify({ action: "release", meetingId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["schools", "meetings", "admin"] });
    },
  });

  const askToRelease = async (slot: Slot) => {
    const who = slot.student
      ? `${slot.student.firstName} ${slot.student.lastName}`
      : "this booking";
    const confirmed = await dsConfirm({
      title: `Release ${formatTime(slot.startsAt)} with ${slot.teacherProfile.user.name}`,
      description: `The meeting about ${who} is cancelled and the slot goes back on the list as free, so another family can take it. Nobody is told automatically — ring them.`,
      confirmLabel: "Release the slot",
      variant: "warning",
    });
    if (!confirmed) return;

    setOpenResult(null);
    setSent(null);
    setReleased(
      `${formatTime(slot.startsAt)} with ${slot.teacherProfile.user.name} is free again.`,
    );
    setFreedFamily(
      slot.student
        ? {
            studentId: slot.student.id,
            who: `${slot.student.firstName} ${slot.student.lastName}`,
            when: `${formatDay(dayKey(new Date(slot.startsAt)))} at ${formatTime(slot.startsAt)}`,
            teacherName: slot.teacherProfile.user.name,
          }
        : null,
    );
    release.mutate(slot.id);
  };

  const filtersPending = termsQuery.isPending || teachersQuery.isPending;

  // A notice reaches every family it is addressed to and cannot be recalled, so
  // the notices route gates it on `schools.reports` create — the head's grant.
  // The button says so rather than failing after the letter is written.
  const canWriteToFamilies = access.can("schools.reports", "create");
  // Booking on a family's behalf is the same write as releasing one.
  const canBook = access.can("schools.students", "edit");

  const clearFilters = () => {
    setTeacherProfileId("");
    setYearGroup({ classId: "", streamId: "" });
    setEveningKey("");
    setSearch("");
  };

  // The narrowing in the office's own words, for the list to repeat back when
  // it comes up empty. The term is not in it: there is always a term in view,
  // so naming it would put a filter nobody set on every empty state.
  const narrowing = [
    teachers.find((row) => row.id === teacherProfileId)?.user.name ?? null,
    evenings.find((evening) => evening.key === eveningKey)?.label ?? null,
    search.trim() || null,
  ].filter((entry): entry is string => Boolean(entry));

  return (
    <div className="space-y-4">
      <PageChrome title="Parent meetings">
        <CreateButton
          resource="schools.students"
          action="edit"
          label="Open slots"
          unavailable={
            teachers.length === 0
              ? "Slots are opened against a teacher's profile, and there are none."
              : undefined
          }
          onSelect={() => {
            setOpenResult(null);
            setReleased(null);
            setOpening(true);
          }}
        />
      </PageChrome>

      <PageBand
        chips={[
          { label: "Slots open", value: slots.length, tone: "brand" },
          { label: "Booked", value: booked, tone: booked > 0 ? "success" : "neutral" },
          { label: "Free", value: free, tone: free > 0 ? "warn" : "neutral" },
        ]}
      />

      <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
        The term&rsquo;s parents&rsquo; evenings across the whole staff room — who is
        open, who is booked, and which ten minutes are still free.
      </p>

      {termsQuery.error ? (
        <LoadError
          what="the terms"
          error={termsQuery.error}
          onRetry={() => void termsQuery.refetch()}
        />
      ) : null}
      {teachersQuery.error ? (
        <LoadError
          what="the teachers"
          error={teachersQuery.error}
          onRetry={() => void teachersQuery.refetch()}
        />
      ) : null}
      {release.error ? <SaveError what="The slot" error={release.error} /> : null}
      {bookSlot.error ? <SaveError what="The booking" error={bookSlot.error} /> : null}
      {printBlocked ? (
        <Alert
          tone="warn"
          title="Your browser blocked the print window"
          onDismiss={() => setPrintBlocked(false)}
        >
          Allow pop-ups for this site and press Print again — the evening is ready, it
          just has nowhere to open.
        </Alert>
      ) : null}
      {released && !release.isPending && !bookSlot.isPending && !release.error ? (
        <Alert
          tone="success"
          title={released}
          onDismiss={() => {
            setReleased(null);
            setFreedFamily(null);
          }}
          actions={
            freedFamily ? (
              <Button
                variant="secondary"
                size="sm"
                disabled={!canWriteToFamilies}
                title={
                  canWriteToFamilies
                    ? undefined
                    : "Writing to families is the head's to do — ring them instead."
                }
                onClick={() => setTellingFamily(true)}
              >
                Tell the family
              </Button>
            ) : undefined
          }
        >
          {freedFamily
            ? `Nobody is told automatically. ${freedFamily.who}'s family still think they are coming.`
            : null}
        </Alert>
      ) : null}
      {sent ? (
        <Alert tone="success" title={sent} onDismiss={() => setSent(null)} />
      ) : null}

      {/*
        The rule the canvas is strictest about: a table's tabs, its search box
        and its filters are one row directly above the thing they control. They
        change the schedule below and nothing else, so they travel with it
        rather than being scattered between the band and the cards.
      */}
      <TableControls
        search={
          <TableSearch
            label="Search"
            value={search}
            onChange={setSearch}
            placeholder="Search a pupil or a teacher"
          />
        }
        filters={
          <>
            <FilterSelect
              label="Term"
              allLabel="The current term"
              value={term?.id ?? ""}
              options={terms.map((row) => ({
                value: row.id,
                label: `${row.name} · ${row.academicYear.name}${row.isActive ? " (current)" : ""}`,
              }))}
              onChange={(value) => {
                setChosenTermId(value);
                setOpenResult(null);
                setReleased(null);
              }}
            />
            <FilterSelect
              label="Teacher"
              allLabel="Every teacher"
              value={teacherProfileId}
              options={teachers.map((row) => ({ value: row.id, label: row.user.name }))}
              onChange={(value) => {
                setTeacherProfileId(value);
                setReleased(null);
              }}
            />
            <ClassFilter
              label="Year group"
              allLabel="Every year group"
              includeStreams={false}
              value={yearGroup}
              onChange={(value) => {
                setYearGroup(value);
                setEveningKey("");
                setReleased(null);
              }}
            />
            <FilterSelect
              label="Evening"
              allLabel="Every evening"
              value={eveningKey}
              options={evenings.map((evening) => ({
                value: evening.key,
                label: `${evening.label} · ${evening.booked} of ${evening.slots}`,
              }))}
              onChange={(value) => {
                setEveningKey(value);
                setReleased(null);
              }}
            />
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Slots open"
          value={<span className="tabular-nums">{slots.length}</span>}
          footer={term ? `${term.name} · ${term.academicYear.name}` : "No term"}
        />
        <StatCard
          label="Booked"
          tone={booked > 0 ? "success" : "neutral"}
          value={<span className="tabular-nums">{booked}</span>}
          footer={
            slots.length > 0
              ? `${Math.round((booked / slots.length) * 100)}% of the slots taken`
              : "Nothing open to book yet"
          }
        />
        <StatCard
          label="Free"
          tone={free > 0 ? "brand" : "neutral"}
          value={<span className="tabular-nums">{free}</span>}
          footer={
            slots.length === 0
              ? "Nothing open to book yet"
              : free > 0
                ? "still available to families"
                : "Every slot is taken"
          }
        />
      </div>

      {/*
        The teacher list and the calendar are the same evening asked two
        different ways — "who is booked with Ms Banda" and "which nights are
        we open" — so they sit beside each other and are counted from one
        filtered set. The panel drops under the list below `lg`, where a
        20rem column would squeeze the time range out of every row.
      */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
        {filtersPending || scheduleQuery.isPending ? (
          /*
            Cards, one per teacher, because that is what the schedule is — a
            stack of staff-room evenings, not a table. Two of them is the usual
            night; a grey block the height of the whole column would move
            everything below it when the real cards arrive.
          */
          <CardsSkeleton count={2} columns={1} lines={5} />
        ) : scheduleQuery.error ? (
          /*
            Scoped to the schedule column, not the page. The band, the tiles and
            the evenings panel beside it are drawn from what did load; a
            page-wide alert would throw those away to report the one read that
            failed.
          */
          <LoadError
            what="the schedule"
            error={scheduleQuery.error}
            onRetry={() => void scheduleQuery.refetch()}
          />
        ) : !term ? (
          <NothingYet
            title="No term has been set up"
            body="A parents' evening is booked inside a term. Create one under Years and terms, and this screen has a window to open slots in."
            action={
              <Button asChild variant="secondary">
                <Link href="/schools/academics">Open years and terms</Link>
              </Button>
            }
          />
        ) : teachers.length === 0 ? (
          <NothingYet
            title="No teachers on the staff list"
            body="Slots are opened against a teacher's profile. Add staff under Teachers first."
            action={
              <Button asChild variant="secondary">
                <Link href="/schools/teachers">Open the staff list</Link>
              </Button>
            }
          />
        ) : byTeacher.length === 0 ? (
          allSlots.length > 0 ? (
            <NothingMatched
              what="slots"
              filters={narrowing}
              onClear={clearFilters}
            />
          ) : (
            <NothingYet
              title={`No parents' evening is open in ${term.name}`}
              body="Open a window against a teacher and every ten minutes inside it becomes a free row a family can take from their portal."
              action={
                <CreateButton
                  resource="schools.students"
                  action="edit"
                  label="Open slots"
                  onSelect={() => setOpening(true)}
                />
              }
            />
          )
        ) : (
          /*
            Booking and releasing both rewrite the schedule this list is drawn
            from, so the whole thing dims while one is in flight. Two families
            taking the same ten minutes because the first press had not landed
            is the failure this stops.
          */
          <SavingOverlay
            saving={release.isPending || bookSlot.isPending}
            label={release.isPending ? "Releasing…" : "Booking…"}
          >
          <div className="space-y-4">
            {byTeacher.map((group) => {
              const teacherBooked = group.slots.filter((slot) => slot.bookedAt).length;
              return (
                <Card
                  key={group.name + group.slots[0]!.teacherProfile.id}
                  title={
                    <span className="flex items-center gap-2">
                      <PersonAvatar name={group.name} src={group.image} size="sm" />
                      {group.name}
                    </span>
                  }
                  subtitle={`${group.slots.length} slot${group.slots.length === 1 ? "" : "s"} · ${teacherBooked} booked · ${group.slots.length - teacherBooked} free`}
                  actions={
                    <Button
                      variant="quiet"
                      size="sm"
                      onClick={() => {
                        // The evening is what a teacher carries to the hall —
                        // a paper list of times and names, because the desk
                        // they sit at has no screen on it.
                        const ok = printEvening({
                          teacherName: group.name,
                          rows: group.slots.map((slot) => ({
                            when: `${formatTime(slot.startsAt)} – ${formatTime(slot.endsAt)}`,
                            day: formatDay(dayKey(new Date(slot.startsAt))),
                            who: slot.student
                              ? `${slot.student.lastName}, ${slot.student.firstName}`
                              : "Free — nobody has taken this slot",
                            detail: [
                              slot.student?.studentNo,
                              slot.student?.currentClass?.name,
                              slot.location ?? "No room set",
                            ]
                              .filter(Boolean)
                              .join(" · "),
                            guardian: slot.guardian
                              ? `${slot.guardian.firstName} ${slot.guardian.lastName} · ${slot.guardian.phone}`
                              : slot.bookedAt
                                ? "No guardian named on the booking"
                                : "",
                          })),
                        });
                        setPrintBlocked(!ok);
                      }}
                    >
                      {printEveningLabel(group.name)}
                    </Button>
                  }
                  flush
                >
                  <ul className="flex flex-col">
                    {group.slots.map((slot, index) => {
                      const key = dayKey(new Date(slot.startsAt));
                      const previous = group.slots[index - 1];
                      const newDay =
                        !previous || dayKey(new Date(previous.startsAt)) !== key;
                      return (
                        <li key={slot.id}>
                          {newDay ? (
                            <p className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-muted)] px-4 py-2 text-[length:var(--type-caption)] font-semibold uppercase tracking-wide text-[color:var(--text-muted)]">
                              {formatDay(key)}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3">
                            <span className="w-[8.5rem] shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--type-body-sm)] tabular-nums text-[color:var(--text-strong)]">
                              {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
                            </span>

                            {slot.student ? (
                              <PersonAvatar
                                firstName={slot.student.firstName}
                                lastName={slot.student.lastName}
                                size="xs"
                              />
                            ) : null}

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                                {slot.student
                                  ? `${slot.student.lastName}, ${slot.student.firstName}`
                                  : slot.bookedAt
                                    ? "Booked, but the pupil record has gone"
                                    : "Free — nobody has taken this slot"}
                              </p>
                              <p className="truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                                {[
                                  slot.student?.studentNo,
                                  slot.student?.currentClass?.name,
                                  slot.location ?? "No room set",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                              {slot.guardian ? (
                                <p className="truncate text-[length:var(--type-caption)] text-[color:var(--text-body)]">
                                  {slot.guardian.firstName} {slot.guardian.lastName} ·{" "}
                                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                                    {slot.guardian.phone}
                                  </span>
                                </p>
                              ) : slot.bookedAt ? (
                                <p className="truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                                  No guardian named on the booking
                                </p>
                              ) : null}
                              {slot.notes ? (
                                <p className="truncate text-[length:var(--type-caption)] text-[color:var(--text-body)]">
                                  {slot.notes}
                                </p>
                              ) : null}
                            </div>

                            {slot.bookedAt ? (
                              <>
                                <Badge tone="success" dot>
                                  Booked
                                </Badge>
                                <RecordActions
                                  resource="schools.students"
                                  verbs={[
                                    {
                                      label: "Change the booking",
                                      action: "edit",
                                      onSelect: () => {
                                        setReleased(null);
                                        setSent(null);
                                        bookSlot.reset();
                                        setBooking({ slot, mode: "edit" });
                                      },
                                    },
                                    {
                                      label: "Release",
                                      action: "edit",
                                      tone: "danger",
                                      loading:
                                        release.isPending && release.variables === slot.id,
                                      onSelect: () => void askToRelease(slot),
                                    },
                                  ]}
                                />
                              </>
                            ) : (
                              <>
                                <Badge tone="neutral" dot>
                                  Free
                                </Badge>
                                {/*
                                  Families book from the portal, but one without an
                                  account rings the office — and the office could
                                  see the empty ten minutes and not fill it.
                                */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={!canBook}
                                  title={
                                    canBook ? undefined : "This is the registrar to do."
                                  }
                                  onClick={() => {
                                    setReleased(null);
                                    setSent(null);
                                    bookSlot.reset();
                                    setBooking({ slot, mode: "book" });
                                  }}
                                >
                                  Book for a family
                                </Button>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}
          </div>
          </SavingOverlay>
        )}
        </div>

        <div className="space-y-4">
          <EveningsPanel
            evenings={evenings}
            selectedKey={eveningKey}
            onSelect={(key) => {
              setEveningKey(key);
              setReleased(null);
            }}
          />

          {/*
            Said once, on the screen, rather than only inside the dialog that
            is already asking a yes-or-no question. An office that knows what
            releasing does before it presses the row verb rings the family
            first, which is the whole point.
          */}
          <Card title="Releasing a slot" className="h-fit">
            <Alert tone="warn" title="Nobody is told automatically — ring them.">
              The meeting is cancelled and the slot goes back on the list as free, so
              another family can take it.
            </Alert>
            <p className="mt-3 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              Or let the school do it: after a release, <strong>Tell the family</strong>{" "}
              writes to that pupil&rsquo;s guardians through their portal, addressed to
              exactly the people who thought they were coming.
            </p>
          </Card>
        </div>
      </div>

      {/*
        Mounted only while it is open, so its fields start fresh each time and
        the date it defaults to is computed in the browser. `new Date()` during
        a server render would disagree with the browser's today for any school
        not on UTC, which is a hydration mismatch.
      */}
      {opening ? (
        <OpenSlotsDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setOpening(false);
              setOpenResult(null);
              openSlots.reset();
            }
          }}
          teachers={teachers.map((row) => ({ id: row.id, name: row.user.name }))}
          defaultDate={term ? clampToTerm(term.startDate, term.endDate) : ""}
          defaultTeacherProfileId={teacherProfileId}
          isSubmitting={openSlots.isPending}
          error={openSlots.error ? getApiErrorMessage(openSlots.error) : null}
          result={openResult}
          onSubmit={(form) => openSlots.mutate(form)}
        />
      ) : null}

      {booking ? (
        <BookSlotDialog
          open
          onOpenChange={(next) => {
            if (!next) {
              setBooking(null);
              bookSlot.reset();
            }
          }}
          when={`${formatDay(dayKey(new Date(booking.slot.startsAt)))}, ${formatTime(booking.slot.startsAt)} – ${formatTime(booking.slot.endsAt)}`}
          teacherName={booking.slot.teacherProfile.user.name}
          title={booking.mode === "edit" ? "Change the booking" : "Book for a family"}
          submitLabel={booking.mode === "edit" ? "Save the booking" : "Book the slot"}
          defaults={
            booking.mode === "edit"
              ? {
                  studentId: booking.slot.student?.id ?? "",
                  guardianId: booking.slot.guardian?.id ?? "",
                  notes: booking.slot.notes ?? "",
                  search: booking.slot.student?.lastName ?? "",
                }
              : undefined
          }
          isSubmitting={bookSlot.isPending}
          error={bookSlot.error ? getApiErrorMessage(bookSlot.error) : null}
          onSubmit={(values) => bookSlot.mutate({ intent: booking, values })}
        />
      ) : null}

      {tellingFamily && freedFamily ? (
        <SendNoticeDialog
          open
          onOpenChange={setTellingFamily}
          title="Tell the family"
          audience={{
            studentIds: [freedFamily.studentId],
            describe: `${freedFamily.who}'s guardians`,
          }}
          severity="WARNING"
          defaultSubject="Your parents' evening appointment has been cancelled"
          defaultBody={`The appointment with ${freedFamily.teacherName} on ${freedFamily.when} about ${freedFamily.who} has been cancelled. Please book another ten minutes from the portal, or ring the school office and we will find you one.`}
          sendLabel="Send it"
          onSent={(result) => {
            setFreedFamily(null);
            setReleased(null);
            setSent(
              result.recipients > 0
                ? `${freedFamily.who}'s family have been told.`
                : `Nobody in ${freedFamily.who}'s family has a portal account — ring them.`,
            );
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * A sensible date to open against: today when the term is running, otherwise
 * the day the term starts. An evening opened last Tuesday by accident is a
 * screen full of slots nobody can book.
 */
function clampToTerm(startDate: string, endDate: string) {
  const today = dayKey(new Date());
  const start = startDate.slice(0, 10);
  const end = endDate.slice(0, 10);
  if (today < start) return start;
  if (today > end) return end;
  return today;
}
