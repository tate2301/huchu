"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Calendar,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  StatCard,
} from "@corelithzw/react";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { dsConfirm } from "@corelithzw/ui/components/ds-confirm";
import { fetchJson } from "@corelithzw/platform/api-client";
import { useTeacherPortal } from "./teacher-portal-context";

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
    currentClass: { name: string } | null;
  } | null;
};

type Schedule = { slots: Slot[] };

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

const SLOT_LENGTHS = [10, 15, 20, 30];

const pad = (value: number) => String(value).padStart(2, "0");

/** `YYYY-MM-DD` for a local-time date, which is the key the screen groups on. */
function dayKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `YYYY-MM-DD` back to a local-time date, so it lands on the day it names. */
function parseDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/** "3 June 2026" — day, month, year, no zero padding. */
function formatDay(key: string) {
  const date = parseDay(key);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "17:00" — 24-hour, from an instant. */
function formatTime(iso: string) {
  const date = new Date(iso);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/**
 * Parent meetings: a teacher's evening, free slots and all.
 *
 * The demo draws this as a month on the left and the day's slots on the right,
 * and that is the right shape — a parents' evening is a date first and a list
 * second. The calendar is the picker, and only the evenings that actually have
 * slots on them can be chosen, which is how "this day has bookings" survives
 * into a component that has no per-day marker of its own.
 *
 * Free slots are rows, not gaps. That is the whole point of the model: a
 * parent opens their portal to find out when the teacher is *available*, and a
 * list that only showed bookings could only ever say when they are not. So a
 * free slot reads as free here too, with the same weight as a booked one, and
 * releasing a booking puts the row back rather than deleting it.
 *
 * Opening an evening is a window and a slot length rather than a slot at a
 * time. A teacher setting up Thursday is saying "17:00 to 19:00, ten minutes
 * each", and asking them to press a button twelve times is asking them to do
 * the division themselves.
 */
export function TeacherMeetingsScreen() {
  const queryClient = useQueryClient();
  const { day, error: portalError } = useTeacherPortal();

  /**
   * The month on screen, and the day inside it — both `null` until the teacher
   * moves, so the first paint is the school's today rather than the tablet's.
   *
   * `day.onDate` is decided on the server. Seeding either of these from
   * `new Date()` during render would make the server and the browser disagree
   * about what today is whenever the tablet is not on UTC, which is a
   * hydration mismatch that empties the whole screen.
   */
  const [chosenMonth, setChosenMonth] = useState<string | null>(null);
  const [chosenDay, setChosenDay] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);
  /**
   * A teacher's evening runs to a dozen slots and the one they came to find is
   * usually the free one, or the one family they need to look up. Both are a
   * scan otherwise.
   */
  const [showing, setShowing] = useState<"ALL" | "BOOKED" | "FREE">("ALL");

  const today = day.onDate ?? null;
  const monthKey = chosenMonth ?? (today ? `${today.slice(0, 7)}-01` : null);

  const monthStart = monthKey ? parseDay(monthKey) : null;
  const monthEnd = monthStart
    ? new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)
    : null;

  // A day either side of the month: the API's window is UTC and the days on
  // screen are local, so the edges would otherwise drop slots on the 1st or
  // the 31st for any school that is not on UTC.
  const from = monthStart ? dayKey(addDays(monthStart, -1)) : null;
  const to = monthEnd ? dayKey(addDays(monthEnd, 1)) : null;

  const query = useQuery({
    queryKey: ["schools", "portal", "teacher", "meetings", from, to],
    queryFn: () =>
      fetchJson<Schedule>(`/api/v2/schools/meetings?from=${from}&to=${to}&mine=true`),
    enabled: Boolean(from && to && day.teacher),
  });

  const slots = query.data?.slots ?? [];

  // Slots grouped by the day they fall on, which is what both the calendar and
  // the list read from.
  const byDay = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = dayKey(new Date(slot.startsAt));
    byDay.set(key, [...(byDay.get(key) ?? []), slot]);
  }
  const openEvenings = [...byDay.keys()].sort();

  /**
   * The day on screen, derived rather than stored.
   *
   * What the teacher picked, if it still has slots on it; otherwise today when
   * today is one of the open evenings; otherwise the first open evening of the
   * month. A month with no evenings open has no day to show, and says so.
   */
  const selectedDay =
    (chosenDay && byDay.has(chosenDay) ? chosenDay : null) ??
    (today && byDay.has(today) ? today : null) ??
    openEvenings[0] ??
    null;

  const daySlots = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const visibleSlots = daySlots.filter((slot) => {
    if (showing === "BOOKED") return Boolean(slot.bookedAt);
    if (showing === "FREE") return !slot.bookedAt;
    return true;
  });
  const booked = daySlots.filter((slot) => slot.bookedAt).length;
  const free = daySlots.length - booked;
  const monthBooked = slots.filter((slot) => slot.bookedAt).length;

  const openEvening = useMutation({
    mutationFn: async (form: {
      onDate: string;
      startsAt: string;
      endsAt: string;
      minutesEach: number;
      location: string;
    }) => {
      const start = new Date(`${form.onDate}T${form.startsAt}`);
      const end = new Date(`${form.onDate}T${form.endsAt}`);
      return fetchJson<{ created: number; skipped: number }>(
        "/api/v2/schools/meetings",
        {
          method: "POST",
          body: JSON.stringify({
            action: "open",
            from: start.toISOString(),
            to: end.toISOString(),
            minutesEach: form.minutesEach,
            location: form.location.trim() || null,
          }),
        },
      );
    },
    onSuccess: (result, form) => {
      setOpening(false);
      setChosenMonth(`${form.onDate.slice(0, 7)}-01`);
      setChosenDay(form.onDate);
      setOpened(
        result.created === 0
          ? `Nothing to open on ${formatDay(form.onDate)} — those slots already exist`
          : `${formatDay(form.onDate)} opened — ${result.created} slot${result.created === 1 ? "" : "s"} free to book`,
      );
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "teacher", "meetings"],
      });
    },
  });

  const release = useMutation({
    mutationFn: (meetingId: string) =>
      fetchJson("/api/v2/schools/meetings", {
        method: "POST",
        body: JSON.stringify({ action: "release", meetingId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["schools", "portal", "teacher", "meetings"],
      });
    },
  });

  const askToRelease = async (slot: Slot) => {
    const who = slot.student
      ? `${slot.student.firstName} ${slot.student.lastName}`
      : "this booking";
    const confirmed = await dsConfirm({
      title: `Release ${formatTime(slot.startsAt)} on ${formatDay(dayKey(new Date(slot.startsAt)))}`,
      description: `The slot goes back on the list as free and the meeting about ${who} is no longer booked. Another parent can take it.`,
      confirmLabel: "Release the slot",
      variant: "warning",
    });
    if (confirmed) {
      setOpened(null);
      release.mutate(slot.id);
    }
  };

  if (portalError) {
    return <LoadError what="your portal" error={portalError} />;
  }

  if (!day.teacher) {
    return (
      <EmptyState
        title="You are not linked to a teacher profile"
        body="Ask the school office to link your account to your staff record. Parent meetings are booked against a teacher, so there is nothing to show until then."
      />
    );
  }

  // Without a term there is no school date to anchor the calendar on, and the
  // query above never runs. Saying so beats a skeleton that never resolves.
  if (!monthStart) {
    return (
      <EmptyState
        title="No term is running"
        body="The school has no active term, so there is no calendar to open an evening against."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {query.error ? (
        <LoadError
          what="your meetings"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {openEvening.error ? (
        <SaveError what="The evening" error={openEvening.error} />
      ) : null}
      {release.error ? <SaveError what="The slot" error={release.error} /> : null}
      {opened ? (
        <Alert tone="success" title={opened} onDismiss={() => setOpened(null)} />
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[length:var(--type-h3)] font-semibold text-[color:var(--text-strong)]">
            Parent meetings
          </h2>
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            Parents book these from their own portal
            {day.term ? ` · ${day.term.name}` : ""}
          </p>
        </div>
        <Button variant="primary" onClick={() => setOpening(true)}>
          Open an evening
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card
          title="Pick an evening"
          subtitle={`${MONTHS[monthStart.getMonth()]} ${monthStart.getFullYear()}`}
        >
          <div className="flex flex-col gap-3">
            <Calendar
              {...(selectedDay ? { value: parseDay(selectedDay) } : {})}
              month={monthStart}
              onMonthChange={(next) => {
                setChosenMonth(`${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`);
                setChosenDay(null);
                setOpened(null);
              }}
              onValueChange={(next) => {
                setChosenDay(dayKey(next));
                setOpened(null);
              }}
              isDateDisabled={(date) => !byDay.has(dayKey(date))}
            />
            <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              Only evenings with slots on them can be picked. Open one to put a date
              on the calendar.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <StatCard
                label="Evenings open"
                value={<span className="tabular-nums">{openEvenings.length}</span>}
                footer="this month"
              />
              <StatCard
                label="Slots booked"
                value={<span className="tabular-nums">{monthBooked}</span>}
                footer={`of ${slots.length} this month`}
              />
            </div>
          </div>
        </Card>

        <Card
          title={selectedDay ? formatDay(selectedDay) : "No evening picked"}
          subtitle={
            selectedDay
              ? `${daySlots.length} slot${daySlots.length === 1 ? "" : "s"} · ${booked} booked · ${free} free`
              : undefined
          }
        >
          {daySlots.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  { value: "ALL", label: `All ${daySlots.length}` },
                  { value: "BOOKED", label: `Booked ${booked}` },
                  { value: "FREE", label: `Free ${free}` },
                ] as const
              ).map((option) => (
                <Button
                  key={option.value}
                  size="sm"
                  variant={showing === option.value ? "primary" : "secondary"}
                  onClick={() => setShowing(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}

          {query.isPending ? (
            <TableRowsSkeleton
              headers={["Time", "Who", "State"]}
              columns={[
                { width: 136 },
                { avatar: true, twoLine: true },
                { width: 88, badge: true },
              ]}
              rows={8}
            />
          ) : openEvenings.length === 0 ? (
            <NothingYet
              title="No evening is open this month"
              body="Open one above and every slot in the window appears here as free, ready for a parent to take."
              action={
                <Button variant="secondary" onClick={() => setOpening(true)}>
                  Open an evening
                </Button>
              }
            />
          ) : daySlots.length === 0 ? (
            <NothingYet
              title="Nothing on this evening"
              body="Pick another date on the calendar, or open this one."
            />
          ) : visibleSlots.length === 0 ? (
            <NothingMatched
              what="slots"
              filters={[showing === "BOOKED" ? "booked" : "free"]}
              onClear={() => setShowing("ALL")}
            />
          ) : (
            /* Releasing a slot rewrites the row under the teacher's thumb, so
               the evening stops taking taps until it comes back. */
            <SavingOverlay saving={release.isPending} label="Releasing the slot…">
              <ul className="flex flex-col rounded-[var(--radius-md)] border border-[color:var(--border)]">
                {visibleSlots.map((slot) => (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3 last:border-b-0"
                  >
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
                            : "Nobody has taken this slot"}
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
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={release.isPending && release.variables === slot.id}
                          onClick={() => void askToRelease(slot)}
                        >
                          Release
                        </Button>
                      </>
                    ) : (
                      <Badge tone="neutral" dot>
                        Free
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </SavingOverlay>
          )}
        </Card>
      </div>

      {opening ? (
        <OpenEveningModal
          defaultDate={selectedDay ?? today ?? ""}
          pending={openEvening.isPending}
          onClose={() => setOpening(false)}
          onSubmit={(form) => openEvening.mutate(form)}
        />
      ) : null}
    </div>
  );
}

type OpenEveningForm = {
  onDate: string;
  startsAt: string;
  endsAt: string;
  minutesEach: number;
  location: string;
};

/**
 * Opening an evening: a window and a slot length.
 *
 * Held in its own component, and mounted only while it is open, so its five
 * fields start fresh each time rather than a teacher opening Thursday and
 * finding Tuesday's times still in the boxes. Seeding them from props on a
 * component that never unmounted would need an effect to resync, which is the
 * cascading render the compiler lint exists to prevent.
 */
function OpenEveningModal({
  defaultDate,
  pending,
  onClose,
  onSubmit,
}: {
  defaultDate: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: OpenEveningForm) => void;
}) {
  const [onDate, setOnDate] = useState(defaultDate);
  const [startsAt, setStartsAt] = useState("17:00");
  const [endsAt, setEndsAt] = useState("19:00");
  const [minutesEach, setMinutesEach] = useState(10);
  const [location, setLocation] = useState("");

  const minutes =
    onDate && startsAt && endsAt
      ? (new Date(`${onDate}T${endsAt}`).getTime() -
          new Date(`${onDate}T${startsAt}`).getTime()) /
        60000
      : 0;
  const count = minutes > 0 ? Math.floor(minutes / minutesEach) : 0;
  const ready = Boolean(onDate) && count > 0;

  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title="Open an evening"
      description="Every slot in the window is created free, and parents book them from their own portal."
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex-1 text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            {ready ? (
              <>
                <span className="tabular-nums">{count}</span> slot
                {count === 1 ? "" : "s"} of{" "}
                <span className="tabular-nums">{minutesEach}</span> minutes
              </>
            ) : (
              "Pick a date and a window longer than one slot"
            )}
          </p>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={pending}
            disabled={!ready}
            onClick={() =>
              onSubmit({ onDate, startsAt, endsAt, minutesEach, location })
            }
          >
            Open the evening
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Date"
          type="date"
          value={onDate}
          onChange={(event) => setOnDate(event.target.value)}
        />
        <Select
          label="Slot length"
          value={String(minutesEach)}
          onChange={(event) => setMinutesEach(Number(event.target.value))}
        >
          {SLOT_LENGTHS.map((value) => (
            <option key={value} value={value}>
              {value} minutes
            </option>
          ))}
        </Select>
        <Input
          label="From"
          type="time"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
        />
        <Input
          label="To"
          type="time"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
        />
        <Input
          label="Where"
          hint="Shown to parents when they book. Optional."
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          wrapperClassName="sm:col-span-2"
        />
      </div>
    </Modal>
  );
}
