"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Badge,
  Button,
  Card,
  DatePicker,
  EmptyState,
  SegmentedControl,
} from "@corelithzw/react";
import { MoreHorizontal } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { TableSearch } from "@/components/schools/common/table-controls";
import { dsConfirm } from "@/components/ui/ds-confirm";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { useOfflineConnectivity } from "@/hooks/use-offline-connectivity";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolDate } from "@/lib/schools/format";
import { useTeacherPortal, type TeacherPeriod } from "./teacher-portal-context";

type Mark = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

type Row = {
  studentId: string;
  studentNo: string;
  firstName: string;
  lastName: string;
  isBoarding: boolean;
  status: Mark | null;
  remarks: string | null;
};

type RegisterStatus = "DRAFT" | "SUBMITTED" | "LOCKED";

type Register = {
  classSubject: {
    id: string;
    termId: string;
    classId: string;
    className: string;
    streamId: string | null;
    streamName: string | null;
    subjectName: string;
    termName: string;
  };
  onDate: string;
  session: {
    id: string;
    status: RegisterStatus;
    notes: string | null;
    /** Whether marks may still be changed. Only a locked day says no. */
    canMark: boolean;
    /** Whether the day can still be sent to the office. */
    canSubmit: boolean;
  } | null;
  rows: Row[];
};

/** What the attendance write answers with: the session it touched, and where it now stands. */
type Saved = {
  sessionId: string;
  status: RegisterStatus;
  marked: number;
  canSubmit: boolean;
};

/**
 * The three a register is taken with. Excused is a fourth answer a teacher
 * gives a handful of times a term — it belongs behind the row's menu, not in
 * the control they tap thirty times before the lesson starts.
 */
const MARKS = [
  { value: "PRESENT", label: "Present" },
  { value: "ABSENT", label: "Absent" },
  { value: "LATE", label: "Late" },
] as const;

/** How each state of a register reads to the person who took it. */
const STATUS: Record<RegisterStatus, { label: string; tone: "neutral" | "success" | "info" }> = {
  DRAFT: { label: "Not yet sent in", tone: "neutral" },
  SUBMITTED: { label: "Sent to the office", tone: "success" },
  LOCKED: { label: "Closed by the office", tone: "info" },
};

/** The narrowing above the roll, in the words a teacher would use for it. */
const SHOWING = [
  { value: "ALL", label: "Everyone" },
  { value: "UNMARKED", label: "Not marked" },
  { value: "AWAY", label: "Not present" },
] as const;

type Showing = (typeof SHOWING)[number]["value"];

/** Y-M-D in the tablet's own clock, which is the day the teacher means. */
function isoDay(date: Date) {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The three-way the register is taken with.
 *
 * Not the design system's `SegmentedControl`: its roving tabindex keys off the
 * selected option, so a group with nothing selected — which is every row of a
 * register nobody has taken yet — leaves no segment tabbable at all and the
 * keyboard cannot reach the control. Its segments are also 28px, and this one
 * is tapped standing up on a classroom tablet.
 */
function MarkToggle({
  value,
  label,
  disabled,
  onChange,
}: {
  value: Mark | null;
  label: string;
  disabled: boolean;
  onChange: (value: Mark) => void;
}) {
  const segments = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = MARKS.findIndex((option) => option.value === value);
  // Nothing chosen yet still has to be reachable, so the first segment holds
  // the tab stop until one is.
  const tabbable = selected < 0 ? 0 : selected;

  const step = (from: number, delta: number) => {
    const next = (from + delta + MARKS.length) % MARKS.length;
    segments.current[next]?.focus();
    onChange(MARKS[next]!.value);
  };

  return (
    <div role="radiogroup" aria-label={label} className="te-mark">
      {MARKS.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            segments.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={disabled}
          tabIndex={index === tabbable ? 0 : -1}
          className={`seg ${option.value.toLowerCase()}`}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
              event.preventDefault();
              step(index, 1);
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
              event.preventDefault();
              step(index, -1);
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Taking the register.
 *
 * The demo's shape, and the right one: a counter that moves as you mark, one
 * quick action to say "everybody is here" because that is the true answer most
 * days, then a row per child that a teacher works down. Marking is a single
 * tap, not a dropdown, because it happens standing up with a class waiting.
 *
 * Unmarked is its own state rather than being silently treated as present, and
 * an empty control is how it says so — a badge beside it would state the same
 * fact a second time on every row of the roll.
 *
 * Saving and sending in are two acts. A register is taken in pieces, so a save
 * files the marks and leaves the day open; sending it in is the teacher telling
 * the office the day is done. A day already sent in is still theirs to correct
 * until the office closes it.
 */
export function TeacherRegisterScreen() {
  const queryClient = useQueryClient();
  const { day, selectedClass, setClassSubjectId } = useTeacherPortal();
  const { isOffline } = useOfflineConnectivity();
  /**
   * Empty means "the school's today", which the server decides.
   *
   * An earlier version seeded this from `new Date()` during render. The server
   * renders in UTC and the tablet does not, so the two disagreed about the
   * date and React threw away the whole subtree on hydration — the screen came
   * back blank. Whose "today" it is was also the wrong question: a school day
   * belongs to the school, not to the device in the room.
   */
  const [onDate, setOnDate] = useState("");
  const [edits, setEdits] = useState<Record<string, Mark>>({});
  const [saved, setSaved] = useState<string | null>(null);
  /**
   * Thirty names on a phone is four screens of scrolling. Searching for the
   * one child who walked in late beats thumbing past everybody else, and
   * "Not marked" is the question a teacher asks the roll right before saving.
   */
  const [search, setSearch] = useState("");
  const [showing, setShowing] = useState<Showing>("ALL");

  const classSubjectId = selectedClass?.classSubjectId ?? null;

  const query = useQuery({
    queryKey: ["schools", "portal", "teacher", "register", classSubjectId, onDate],
    queryFn: () =>
      fetchJson<Register>(
        `/api/v2/schools/portal/teacher/me/register?classSubjectId=${classSubjectId}${
          onDate ? `&onDate=${onDate}` : ""
        }`,
      ),
    enabled: Boolean(classSubjectId),
  });

  const register = query.data ?? null;
  const rows = useMemo(() => register?.rows ?? [], [register]);

  /** What is on screen: the saved mark unless the teacher has changed it. */
  const markFor = (row: Row): Mark | null => edits[row.studentId] ?? row.status;

  // Counted from what is on screen, not from what is saved: the numbers have
  // to move as the teacher taps, which is the whole point of showing them.
  const live = rows.map(markFor);
  const counts = {
    present: live.filter((mark) => mark === "PRESENT").length,
    absent: live.filter((mark) => mark === "ABSENT").length,
    late: live.filter((mark) => mark === "LATE").length,
    excused: live.filter((mark) => mark === "EXCUSED").length,
    unmarked: live.filter((mark) => mark === null).length,
  };

  /**
   * The state machine lives on the server and the screen asks it. A submitted
   * register is still open to corrections; only a locked one is closed.
   */
  const locked = register?.session ? !register.session.canMark : false;
  const sendable = register?.session ? register.session.canSubmit : true;
  const dirty = Object.keys(edits).length > 0;

  /** The period this class sits in today, for the header's context line. */
  const period = day.periods.find(
    (row) => row.lesson?.classSubjectId === classSubjectId,
  );
  const nextLesson = periodAfter(day.periods, period);

  /**
   * The narrowing runs over the roll, never over what gets saved. A teacher
   * who searched for one name and then pressed Save would otherwise file a
   * register naming one child and forgetting thirty.
   */
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      const mark = edits[row.studentId] ?? row.status;
      if (showing === "UNMARKED" && mark !== null) return false;
      if (showing === "AWAY" && (mark === null || mark === "PRESENT")) return false;
      if (needle) {
        const haystack = `${row.firstName} ${row.lastName} ${row.studentNo}`;
        if (!haystack.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
  }, [rows, edits, showing, search]);

  const narrowed = showing !== "ALL" || search.trim().length > 0;

  const writeMarks = async (): Promise<Saved> => {
    if (!register) throw new Error("Nothing to save");
    const entries = rows
      .map((row) => ({ studentId: row.studentId, status: markFor(row) }))
      .filter((entry): entry is { studentId: string; status: Mark } =>
        Boolean(entry.status),
      );
    if (entries.length === 0) throw new Error("Nobody has been marked yet");
    return fetchJson<Saved>("/api/v2/schools/portal/teacher/me/attendance", {
      method: "POST",
      body: JSON.stringify({
        termId: register.classSubject.termId,
        classId: register.classSubject.classId,
        streamId: register.classSubject.streamId,
        attendanceDate: register.onDate,
        entries,
      }),
    });
  };

  const settle = () => {
    setEdits({});
    void queryClient.invalidateQueries({ queryKey: ["schools", "portal", "teacher"] });
  };

  const save = useMutation({
    mutationFn: writeMarks,
    onSuccess: () => {
      setSaved(
        `Register saved — ${counts.present} present, ${counts.absent} absent, ${counts.late} late`,
      );
      settle();
    },
  });

  /**
   * Sending in is one act from here even though it is two calls: the marks go
   * first, then the day is sent with the session id the write answered with.
   * Re-saving a register the office already has leaves it where it is rather
   * than sending it twice.
   */
  const sendIn = useMutation({
    mutationFn: async () => {
      const written = await writeMarks();
      if (!written.canSubmit) return written;
      await fetchJson(`/api/v2/schools/attendance/sessions/${written.sessionId}/submit`, {
        method: "POST",
      });
      return { ...written, status: "SUBMITTED" as const };
    },
    onSuccess: (written) => {
      setSaved(
        written.status === "SUBMITTED"
          ? `Sent to the office — ${counts.present} present, ${counts.absent} absent, ${counts.late} late`
          : "Register saved. The office already has this day.",
      );
      settle();
    },
  });

  const busy = save.isPending || sendIn.isPending;

  const markAll = (value: Mark) => {
    setSaved(null);
    setEdits(Object.fromEntries(rows.map((row) => [row.studentId, value])));
  };

  /**
   * Marking a whole class away is the one quick action that is a claim rather
   * than a shortcut, and it sits a thumb's width from Undo.
   */
  const confirmEveryoneAbsent = async () => {
    const confirmed = await dsConfirm({
      title: "Mark everyone absent?",
      description: `This sets all ${rows.length} pupils on the roll to absent. Tap anyone who is here afterwards.`,
      confirmLabel: "Mark everyone absent",
      variant: "warning",
    });
    if (confirmed) markAll("ABSENT");
  };

  /** Save, say what is being filed, and walk on to the next lesson of the day. */
  const saveAndAdvance = async () => {
    const lesson = nextLesson?.lesson;
    const confirmed = await dsConfirm({
      title: "File this register?",
      description: `${counts.present} present, ${counts.absent} absent, ${counts.late} late${
        counts.unmarked > 0
          ? `. ${counts.unmarked} pupil${counts.unmarked === 1 ? " is" : "s are"} still unmarked and will be left blank`
          : ""
      }.${
        lesson
          ? ` Then ${nextLesson?.name} opens — ${lesson.className}${lesson.streamName ? ` ${lesson.streamName}` : ""} · ${lesson.subjectName}.`
          : ""
      }`,
      confirmLabel: lesson ? "Save and go" : "Save the register",
    });
    if (!confirmed) return;
    await save.mutateAsync();
    if (lesson) {
      setSearch("");
      setShowing("ALL");
      setClassSubjectId(lesson.classSubjectId);
    }
  };

  const clearNarrowing = () => {
    setSearch("");
    setShowing("ALL");
  };

  if (!classSubjectId) {
    return (
      <EmptyState
        title="Pick a class first"
        body="Choose one of your classes in the rail on the left and its register opens here."
      />
    );
  }

  const chosenDay = onDate || register?.onDate || "";

  return (
    <div className="flex flex-col gap-4">
      {query.error ? (
        <LoadError what="the register" error={query.error} onRetry={() => void query.refetch()} />
      ) : null}
      {/* A locked day comes back as a 409 carrying the office's own sentence. */}
      {save.error ? <SaveError what="The register" error={save.error} /> : null}
      {sendIn.error ? <SaveError what="The register" error={sendIn.error} /> : null}
      {saved ? (
        <Alert tone="success" title={saved} onDismiss={() => setSaved(null)} />
      ) : null}
      {locked ? (
        <Alert tone="info" title="This register is closed">
          The office has closed this day. Ask them to reopen it if something needs
          changing.
        </Alert>
      ) : null}
      {/*
        A register gets marked in a classroom, and a classroom is where the
        signal goes. Nothing here queues the save — the teacher portal is not
        one of the offline modules — so the honest thing to say is that the
        marks are still on screen and the sending is what has to wait. Claiming
        they were safely stored on the device would be a lie that costs a day's
        attendance.
      */}
      {isOffline ? (
        <Alert tone="warn" title="You are working offline">
          Everything you tap stays on this screen, but it cannot be sent until the
          school&apos;s connection is back. Do not close the page — press Save the
          register again once the bar at the top says Online.
        </Alert>
      ) : null}

      <Card
        title={
          register
            ? `${register.classSubject.className}${register.classSubject.streamName ? ` ${register.classSubject.streamName}` : ""} · ${register.classSubject.subjectName}`
            : "Loading the roll…"
        }
        subtitle={
          register
            ? [
                period ? `${period.name} · ${period.startsAt}–${period.endsAt}` : null,
                formatSchoolDate(register.onDate),
                `${rows.length} pupil${rows.length === 1 ? "" : "s"} on the class list`,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {register?.session ? (
              <Badge tone={STATUS[register.session.status].tone}>
                {STATUS[register.session.status].label}
              </Badge>
            ) : null}
            <DatePicker
              aria-label="Register date"
              placeholder="Change day"
              format={formatSchoolDate}
              {...(chosenDay ? { value: new Date(`${chosenDay}T00:00:00`) } : {})}
              onValueChange={(date) => {
                setOnDate(isoDay(date));
                setEdits({});
                setSaved(null);
              }}
            />
          </div>
        }
      >
        {/* The counter carries its meaning in the tint as well as the number:
            present green, absent red, late amber, the rest neutral. A row of
            four grey tiles makes the teacher read four labels to find the one
            that matters. */}
        <div className="te-counts">
          {[
            { label: "Present", value: counts.present, tone: "success" as const },
            { label: "Absent", value: counts.absent, tone: "danger" as const },
            { label: "Late", value: counts.late, tone: "warn" as const },
            { label: "Not marked", value: counts.unmarked, tone: "neutral" as const },
          ].map((cell) => (
            <div key={cell.label} className={`te-count ${cell.tone}`}>
              <p className="v">{cell.value}</p>
              <p className="lbl">{cell.label}</p>
            </div>
          ))}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          Quick mark
        </span>
        <Button variant="secondary" disabled={locked} onClick={() => markAll("PRESENT")}>
          Everyone present
        </Button>
        <Button variant="secondary" disabled={locked} onClick={() => void confirmEveryoneAbsent()}>
          Everyone absent
        </Button>
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            setEdits({});
            setSaved(null);
          }}
        >
          Undo my changes
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-[220px]">
          <TableSearch
            label="Find a pupil"
            value={search}
            onChange={setSearch}
            placeholder="Search a name or number"
          />
        </div>
        <SegmentedControl<Showing>
          fullWidth={false}
          aria-label="Which pupils to show"
          options={SHOWING.map((option) => ({ ...option }))}
          value={showing}
          onValueChange={setShowing}
        />
      </div>

      {query.isPending ? (
        <TableRowsSkeleton
          headers={["Pupil", "Mark", ""]}
          columns={[{ avatar: true, twoLine: true }, { width: 260 }, { width: 44 }]}
          rows={10}
        />
      ) : rows.length === 0 ? (
        <NothingYet
          title="Nobody is on this class list"
          body="No active pupil has this class as their year group, so there is no register to take. The office puts pupils into a year group under Classes."
        />
      ) : visible.length === 0 ? (
        <NothingMatched
          what="pupils"
          filters={[
            showing === "ALL" ? null : SHOWING.find((row) => row.value === showing)?.label,
            search.trim() || null,
          ].filter((value): value is string => Boolean(value))}
          onClear={clearNarrowing}
        />
      ) : (
        /*
          From the canvas: "The register dims to 50% and stops taking taps. A
          save that accepts more marks halfway through is a save that loses
          them." The whole roll goes under the overlay, not just the button,
          because the taps are the thing that would be lost.
        */
        <SavingOverlay saving={busy} label="Sending the register…">
          <ul className="te-roll">
            {visible.map((row) => {
              const mark = markFor(row);
              const name = `${row.firstName} ${row.lastName}`;
              const setMark = (value: Mark) => {
                if (locked) return;
                setSaved(null);
                setEdits((current) => ({ ...current, [row.studentId]: value }));
              };
              return (
                <li key={row.studentId} className="te-roll-row">
                  <PersonAvatar firstName={row.firstName} lastName={row.lastName} size="sm" />
                  <div className="who">
                    <p className="nm">
                      {row.lastName}, {row.firstName}
                    </p>
                    <p className="id">
                      {row.studentNo}
                      {row.isBoarding ? " · boarder" : ""}
                    </p>
                  </div>
                  {mark === "EXCUSED" ? <Badge tone="info">Excused</Badge> : null}
                  <MarkToggle
                    value={mark}
                    label={`Attendance for ${name}`}
                    disabled={locked}
                    onChange={setMark}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="te-row-menu"
                        aria-label={`More for ${name}`}
                      >
                        <MoreHorizontal className="size-4" aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        disabled={locked}
                        onSelect={(event) => {
                          event.preventDefault();
                          setMark("EXCUSED");
                        }}
                      >
                        Excused
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </SavingOverlay>
      )}

      {narrowed && visible.length > 0 && visible.length < rows.length ? (
        <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
          Showing {visible.length} of {rows.length}. Saving files the whole roll, not
          only what is on screen.
        </p>
      ) : null}

      <div className="te-savebar">
        <p className="counts">
          {counts.present} present · {counts.absent} absent · {counts.late} late
          {counts.excused > 0 ? ` · ${counts.excused} excused` : ""}
          {counts.unmarked > 0 ? (
            <span className="text-[color:var(--tone-warn-strong)]">
              {" "}
              · {counts.unmarked} still unmarked
            </span>
          ) : null}
        </p>
        <Button
          variant="ghost"
          loading={save.isPending}
          disabled={locked || busy || rows.length === 0}
          onClick={() => save.mutate()}
        >
          Save the register
        </Button>
        {sendable ? (
          <Button
            variant="secondary"
            loading={sendIn.isPending}
            disabled={locked || busy || rows.length === 0}
            onClick={() => sendIn.mutate()}
          >
            Send to the office
          </Button>
        ) : null}
        <Button
          variant="primary"
          loading={save.isPending}
          disabled={locked || busy || rows.length === 0}
          onClick={() => void saveAndAdvance()}
        >
          {nextLesson ? "Save & next class" : "Save and finish"}
        </Button>
      </div>
    </div>
  );
}

/** The next lesson of the day after the one in view, for the save bar's hand-off. */
function periodAfter(periods: TeacherPeriod[], current: TeacherPeriod | undefined) {
  if (!current) return null;
  const index = periods.findIndex((row) => row.periodId === current.periodId);
  if (index < 0) return null;
  return periods.slice(index + 1).find((row) => row.lesson) ?? null;
}
