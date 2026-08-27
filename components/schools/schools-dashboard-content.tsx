"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, Badge, Button, Card, StatCard } from "@corelithzw/react";

import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsStudents,
  fetchSchoolsTerms,
} from "@/lib/schools/admin-v2";
import { formatSchoolMoney } from "@/lib/schools/format";

/**
 * The school overview: what has not happened yet today.
 *
 * It replaces a fourteen-row table of record counts — "Class-Subject
 * Assignments 286" — which was identical for all six personas, linked nowhere
 * and answered a question nobody in a school office asks. Nothing on it was
 * wrong; it simply was not a morning.
 *
 * The shape the design settled on, and the rule behind it: an overview is a
 * list of things somebody still has to do, and every row is a link to the screen
 * where they do it. A number with no way through to the work is a number you
 * have to go and find twice. So each panel here is a queue — registers still to
 * come in, work waiting on somebody, homework past its deadline, money still
 * owed — and none of them is a total for its own sake.
 *
 * Everything is fed from endpoints that already exist. Where a figure the design
 * asked for has no endpoint behind it, the line is left out rather than filled
 * with a plausible number: an overview that guesses is worse than one that is
 * short, because it is the screen people trust without checking.
 */

/* ── the shapes the endpoints return ─────────────────────────────────── */

type RegisterRow = {
  classId: string;
  className: string;
  formTeacher: { profileId: string; userId: string; name: string } | null;
  sessions: number;
  state: "MISSING" | "DRAFT" | "SUBMITTED";
  present: number;
  marked: number;
  onRoll: number;
  lastActivityAt: string | null;
};

type RegisterBoard = {
  date: string;
  schoolDay: { isSchoolDay: boolean; reason: string } | null;
  rows: RegisterRow[];
  summary: {
    yearGroups: number;
    withRegister: number;
    missing: number;
    present: number;
    marked: number;
    onRoll: number;
  };
};

type CollectionsSummary = {
  summary: { totalInvoiced: number; totalCollected: number; overallCollectionRate: number };
};

type ArrearsSummary = {
  summary: {
    studentsWithArrears: number;
    totalOutstanding: number;
    aging: {
      current: number;
      days30: number;
      days60: number;
      days90: number;
      days120Plus: number;
    };
  };
};

type OccupancySummary = {
  summary: { totalBeds: number; totalOccupied: number; overallOccupancyRate: number };
};

type HomeworkRow = {
  id: string;
  title: string;
  dueAt: string | null;
  className: string;
  streamName: string | null;
  subjectName: string;
  onRoll: number;
  handedIn: number;
  state: "DRAFT" | "SET" | "DUE_WEEK" | "OVERDUE";
};

type HomeworkOversight = {
  rows: HomeworkRow[];
  summary: { open: number; dueThisWeek: number; overdue: number };
};

type GoalsOversight = { summary: { onRoll: number; withGoal: number; withoutGoal: number } };

type SentNotice = {
  id: string;
  title: string;
  severity: string;
  createdAt: string;
  recipients: number;
  read: number;
};

type MeetingSlot = {
  id: string;
  startsAt: string;
  bookedAt: string | null;
  student: { currentClass: { id: string; name: string } | null } | null;
};

type PublishWindow = {
  id: string;
  closeAt: string | null;
  status: string;
  term: { id: string; name: string } | null;
};

type LibraryRegister = { loans: Array<{ id: string; isOverdue: boolean }> };

type Paged = { pagination: { total: number } };

/* ── small formatting the panels share ───────────────────────────────── */

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
});
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const CLOCK = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function isoToday() {
  // Local parts, not `toISOString()`, which in any timezone ahead of UTC would
  // open the morning on yesterday's registers.
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function percentage(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/* ── the panel furniture ─────────────────────────────────────────────── */

/** A queue, with the way through to it. */
function Panel({
  title,
  caption,
  href,
  linkLabel,
  children,
}: {
  title: string;
  caption?: string;
  href?: string;
  /** What the way through says — "Open the register board", never "View". */
  linkLabel?: string;
  children: ReactNode;
}) {
  return (
    <Card
      flush
      title={
        <span className="flex items-baseline gap-2">
          <span>{title}</span>
          {caption ? (
            <span className="text-[length:var(--type-caption)] font-normal text-[color:var(--text-muted)]">
              {caption}
            </span>
          ) : null}
        </span>
      }
      actions={
        href && linkLabel ? (
          <Button asChild variant="quiet" size="sm">
            <Link href={href}>{linkLabel}</Link>
          </Button>
        ) : undefined
      }
    >
      <div className="divide-y divide-[color:var(--border-subtle)]">{children}</div>
    </Card>
  );
}

/**
 * One line of a queue, and always a link.
 *
 * The rule the overview is built on: a row that explains a number has to reach
 * the screen that fixes it, or the number is just a thing to worry about.
 */
function PanelRow({
  href,
  lead,
  title,
  detail,
  tail,
  trailing,
}: {
  href: string;
  /** A status dot, drawn before the name. */
  lead?: "danger" | "warn" | "success" | "neutral";
  title: ReactNode;
  detail?: ReactNode;
  /** The mono figure on the right of the text — a count, a time. */
  tail?: ReactNode;
  /** A badge or a verb, pinned to the end. */
  trailing?: ReactNode;
}) {
  const dot =
    lead === "danger"
      ? "bg-[color:var(--tone-danger)]"
      : lead === "warn"
        ? "bg-[color:var(--tone-warn)]"
        : lead === "success"
          ? "bg-[color:var(--tone-success)]"
          : "bg-[color:var(--text-muted)]";

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-2.5">
      <Link href={href} className="flex min-w-0 flex-1 items-center gap-2.5 hover:underline">
        {lead ? <span className={`size-1.5 shrink-0 rounded-full ${dot}`} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[length:var(--type-body-sm)] font-semibold">
            {title}
          </span>
          {detail ? (
            <span className="block truncate text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              {detail}
            </span>
          ) : null}
        </span>
        {tail ? (
          <span className="shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
            {tail}
          </span>
        ) : null}
      </Link>
      {trailing ? <span className="shrink-0">{trailing}</span> : null}
    </div>
  );
}

/** A figure and its label, stacked. Used inside the fee panel. */
function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
        {label}
      </div>
      <div
        className="font-[family-name:var(--font-mono)] text-[length:var(--type-body)] font-bold tabular-nums"
        style={tone ? { color: tone } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

/* ── the screen ──────────────────────────────────────────────────────── */

export function SchoolsDashboardContent() {
  const queryClient = useQueryClient();
  const today = isoToday();
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");
  const [day, setDay] = useState("");
  const [reminded, setReminded] = useState<string | null>(null);

  const onDate = day || today;

  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "overview"],
    queryFn: () => fetchSchoolsClasses({ limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "overview"],
    queryFn: () => fetchSchoolsTerms({ limit: 100 }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const activeTerm = useMemo(
    () => terms.find((term) => term.isActive) ?? terms[0] ?? null,
    [terms],
  );
  const term = termId ? (terms.find((row) => row.id === termId) ?? activeTerm) : activeTerm;
  // Everything below is asked in terms of the term actually in view, so the
  // fee panel and the mark sheets cannot be reporting different terms.
  const effectiveTermId = term?.id ?? "";

  const registersQuery = useQuery({
    queryKey: ["schools", "attendance", "board", onDate, classId],
    queryFn: () =>
      fetchJson<RegisterBoard>(
        `/api/v2/schools/attendance/oversight?date=${onDate}${classId ? `&classId=${classId}` : ""}`,
      ),
  });

  const rollQuery = useQuery({
    queryKey: ["schools", "students", "roll", classId],
    queryFn: () =>
      Promise.all([
        fetchSchoolsStudents({ limit: 1, status: "ACTIVE", ...(classId ? { classId } : {}) }),
        fetchSchoolsStudents({
          limit: 1,
          status: "ACTIVE",
          isBoarding: true,
          ...(classId ? { classId } : {}),
        }),
      ]).then(([all, boarders]) => ({
        onRoll: all.pagination.total,
        boarders: boarders.pagination.total,
      })),
  });

  const collectionsQuery = useQuery({
    queryKey: ["schools", "collections", effectiveTermId],
    queryFn: () =>
      fetchJson<CollectionsSummary>(
        `/api/v2/schools/reports/collections${effectiveTermId ? `?termId=${effectiveTermId}` : ""}`,
      ),
  });

  const arrearsQuery = useQuery({
    queryKey: ["schools", "arrears", effectiveTermId, classId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (effectiveTermId) params.set("termId", effectiveTermId);
      if (classId) params.set("classId", classId);
      const query = params.toString();
      return fetchJson<ArrearsSummary>(
        `/api/v2/schools/reports/arrears${query ? `?${query}` : ""}`,
      );
    },
  });

  const occupancyQuery = useQuery({
    queryKey: ["schools", "occupancy"],
    queryFn: () => fetchJson<OccupancySummary>("/api/v2/schools/reports/occupancy"),
  });

  const homeworkQuery = useQuery({
    queryKey: ["schools", "homework", "oversight", effectiveTermId, classId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (effectiveTermId) params.set("termId", effectiveTermId);
      if (classId) params.set("classId", classId);
      const query = params.toString();
      return fetchJson<HomeworkOversight>(
        `/api/v2/schools/assignments/oversight${query ? `?${query}` : ""}`,
      );
    },
  });

  const goalsQuery = useQuery({
    queryKey: ["schools", "goals", "oversight", effectiveTermId, classId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (effectiveTermId) params.set("termId", effectiveTermId);
      if (classId) params.set("classId", classId);
      const query = params.toString();
      return fetchJson<GoalsOversight>(
        `/api/v2/schools/goals/oversight${query ? `?${query}` : ""}`,
      );
    },
  });

  const sheetsQuery = useQuery({
    queryKey: ["schools", "sheets", "submitted", effectiveTermId, classId],
    queryFn: () => {
      const params = new URLSearchParams({ status: "SUBMITTED", limit: "1" });
      if (effectiveTermId) params.set("termId", effectiveTermId);
      if (classId) params.set("classId", classId);
      return fetchJson<Paged>(`/api/v2/schools/results/sheets?${params.toString()}`);
    },
  });

  const windowsQuery = useQuery({
    queryKey: ["schools", "publish-windows", effectiveTermId],
    queryFn: () => {
      const params = new URLSearchParams({ status: "OPEN", limit: "50" });
      if (effectiveTermId) params.set("termId", effectiveTermId);
      return fetchJson<{ data: PublishWindow[] }>(
        `/api/v2/schools/results/publish/windows?${params.toString()}`,
      );
    },
  });

  const admissionsQuery = useQuery({
    queryKey: ["schools", "applications", "applied", classId],
    queryFn: () => {
      const params = new URLSearchParams({ stage: "APPLIED" });
      if (classId) params.set("classId", classId);
      return fetchJson<{ applications: Array<{ id: string }> }>(
        `/api/v2/schools/applications?${params.toString()}`,
      );
    },
  });

  const noticesQuery = useQuery({
    queryKey: ["schools", "notices", "sent", "overview"],
    queryFn: () => fetchJson<{ data: SentNotice[] }>("/api/v2/schools/notices?scope=sent"),
  });

  const meetingsQuery = useQuery({
    queryKey: ["schools", "meetings", "week", onDate],
    queryFn: () => {
      const from = new Date(`${onDate}T00:00:00.000Z`);
      const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000);
      return fetchJson<{ slots: MeetingSlot[] }>(
        `/api/v2/schools/meetings?from=${onDate}&to=${to.toISOString().slice(0, 10)}`,
      );
    },
  });

  const libraryQuery = useQuery({
    queryKey: ["schools", "library", "overdue"],
    queryFn: () => fetchJson<LibraryRegister>("/api/v2/schools/library?overdueOnly=true"),
  });

  const leaveQuery = useQuery({
    queryKey: ["schools", "leave", "out"],
    queryFn: () =>
      fetchJson<{ data: Array<{ id: string }> }>(
        "/api/v2/schools/boarding/leave-requests?status=CHECKED_OUT&limit=100",
      ),
  });

  /* ── what the numbers come to ──────────────────────────────────────── */

  const board = registersQuery.data ?? null;
  const roll = rollQuery.data ?? null;
  const collections = collectionsQuery.data?.summary ?? null;
  const arrears = arrearsQuery.data?.summary ?? null;
  const occupancy = occupancyQuery.data?.summary ?? null;
  const homework = homeworkQuery.data ?? null;

  const missing = useMemo(
    () => (board?.rows ?? []).filter((row) => row.state === "MISSING"),
    [board],
  );
  const overdueHomework = useMemo(
    () => (homework?.rows ?? []).filter((row) => row.state === "OVERDUE").slice(0, 5),
    [homework],
  );
  const nextMeeting = useMemo(() => {
    const slots = meetingsQuery.data?.slots ?? [];
    if (slots.length === 0) return null;
    const free = slots.filter((slot) => !slot.bookedAt).length;
    return { first: slots[0], free, total: slots.length };
  }, [meetingsQuery.data]);
  const closingWindow = useMemo(() => {
    const rows = windowsQuery.data?.data ?? [];
    const upcoming = rows
      .filter((row) => row.closeAt)
      .sort((a, b) => String(a.closeAt).localeCompare(String(b.closeAt)));
    return upcoming[0] ?? null;
  }, [windowsQuery.data]);

  const collectionRate = collections ? Math.round(collections.overallCollectionRate) : 0;
  const occupancyRate = occupancy ? Math.round(occupancy.overallOccupancyRate) : 0;
  const presentRate = board ? percentage(board.summary.present, board.summary.marked) : 0;

  const dayOptions = useMemo(() => {
    // The fortnight behind today. A register board is only ever opened on a day
    // that has already happened, or on this one.
    const start = new Date(`${today}T00:00:00.000Z`);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() - index - 1);
      const iso = date.toISOString().slice(0, 10);
      return { value: iso, label: DAY_LABEL.format(date) };
    });
  }, [today]);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({ reportType: "enrollment", format: "csv" });
    if (effectiveTermId) params.set("termId", effectiveTermId);
    if (classId) params.set("classId", classId);
    return `/api/v2/schools/reports/export?${params.toString()}`;
  }, [effectiveTermId, classId]);

  const anyError =
    registersQuery.error ?? collectionsQuery.error ?? arrearsQuery.error ?? null;

  /**
   * Chasing a register from the morning itself.
   *
   * The canvas puts "Remind" on every missing row here, and it is the same
   * notice the register board sends — same route, same audience resolution —
   * because a reminder that arrives somewhere else is a second inbox for a
   * teacher to learn. The overview is where somebody notices the register is
   * missing, so it is where the chase belongs.
   */
  const remind = useMutation({
    mutationFn: (row: RegisterRow) =>
      fetchJson<{ recipients: number }>("/api/v2/schools/notices", {
        method: "POST",
        body: JSON.stringify({
          title: `${row.className} register for ${onDate}`,
          body: `No register has come in for ${row.className} on ${onDate}. Please take it and send it through.`,
          audience: "TEACHERS",
          classId: row.classId,
          severity: "WARNING",
        }),
      }),
    onSuccess: (result, row) => {
      setReminded(
        `Reminder sent to ${result.recipients} ${result.recipients === 1 ? "person" : "people"} who teach ${row.className}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "notices"] });
    },
  });

  // The narrowing in the office's own words. The overview's three filters are
  // one set — they narrow every panel at once — so an emptied panel repeats all
  // three rather than guessing which one did it.
  const narrowing = [
    classes.find((row) => row.id === classId)?.name ?? null,
    termId ? (term ? `${term.name} · ${term.academicYear.name}` : null) : null,
    day ? DAY_LABEL.format(new Date(`${day}T00:00:00.000Z`)) : null,
  ].filter((entry): entry is string => Boolean(entry));

  const clearFilters = () => {
    setClassId("");
    setTermId("");
    setDay("");
  };

  // A panel is loading until every endpoint it draws from has landed. Drawing
  // a row per query as each arrives makes the panel grow under the reader's
  // eye, which on a screen full of counts is worse than waiting.
  const waitingPending =
    sheetsQuery.isPending ||
    windowsQuery.isPending ||
    admissionsQuery.isPending ||
    homeworkQuery.isPending ||
    goalsQuery.isPending;
  const thisWeekPending =
    meetingsQuery.isPending || noticesQuery.isPending || libraryQuery.isPending;
  const boardingPending = occupancyQuery.isPending || leaveQuery.isPending;

  return (
    <div className="space-y-3">
      <PageBand
        chips={[
          { label: "On the roll", value: roll ? roll.onRoll.toLocaleString() : "—", href: "/schools/students" },
          {
            label: "Registers in",
            value: board ? `${board.summary.withRegister} of ${board.summary.yearGroups}` : "—",
            tone: board && board.summary.missing > 0 ? "warn" : "success",
            href: "/schools/attendance",
          },
          {
            label: "Collected",
            value: collections ? `${collectionRate}%` : "—",
            tone: collectionRate >= 90 ? "success" : "warn",
            href: "/schools/reports",
          },
          {
            label: "Owing",
            value: arrears ? formatSchoolMoney(arrears.totalOutstanding) : "—",
            tone: arrears && arrears.totalOutstanding > 0 ? "danger" : "success",
            href: "/schools/fees",
          },
        ]}
        actions={
          <Button asChild variant="secondary" size="sm">
            <a href={exportHref}>Export</a>
          </Button>
        }
      />

      <FilterBar>
        <FilterSelect
          label="Year group"
          allLabel="Every year group"
          value={classId}
          options={classes.map((row) => ({ value: row.id, label: row.name }))}
          onChange={setClassId}
        />
        <FilterSelect
          label="Term"
          allLabel={activeTerm ? `${activeTerm.name} · ${activeTerm.academicYear.name}` : "This term"}
          value={termId}
          options={terms.map((row) => ({
            value: row.id,
            label: `${row.name} · ${row.academicYear.name}`,
          }))}
          onChange={setTermId}
        />
        <FilterSelect
          label="Day"
          allLabel={`Today, ${DAY_LABEL.format(new Date(`${today}T00:00:00.000Z`))}`}
          value={day}
          options={dayOptions}
          onChange={setDay}
        />
      </FilterBar>

      {anyError ? (
        <LoadError
          what="the school overview"
          error={anyError}
          onRetry={() => {
            void registersQuery.refetch();
            void collectionsQuery.refetch();
            void arrearsQuery.refetch();
          }}
        />
      ) : null}

      {remind.error ? <SaveError what="The reminder" error={remind.error} /> : null}
      {reminded ? (
        <Alert tone="success" title={reminded} onDismiss={() => setReminded(null)} />
      ) : null}

      {board?.schoolDay && !board.schoolDay.isSchoolDay ? (
        <Alert tone="info" title={`Not a school day — ${board.schoolDay.reason}`}>
          No registers are expected. Anything below was taken anyway.
        </Alert>
      ) : null}

      {rollQuery.isPending || registersQuery.isPending ? (
        <StatsSkeleton count={4} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="On the roll"
            value={roll ? roll.onRoll.toLocaleString() : "—"}
            footer={
              roll
                ? `${roll.boarders.toLocaleString()} boarders · ${(roll.onRoll - roll.boarders).toLocaleString()} day`
                : undefined
            }
          />
          <StatCard
            label="Present today"
            value={board ? board.summary.present.toLocaleString() : "—"}
            tone={presentRate >= 90 ? "success" : "warn"}
            footer={
              board
                ? `${presentRate}% of the ${board.summary.withRegister} registers in`
                : undefined
            }
          />
          <StatCard
            label="Collected this term"
            value={collections ? `${collectionRate}%` : "—"}
            tone={collectionRate >= 90 ? "success" : "warn"}
            footer={
              collections
                ? `${formatSchoolMoney(collections.totalCollected)} of ${formatSchoolMoney(collections.totalInvoiced)}`
                : undefined
            }
          />
          <StatCard
            label="Beds occupied"
            value={occupancy ? `${occupancyRate}%` : "—"}
            tone={occupancyRate >= 95 ? "warn" : "success"}
            footer={
              occupancy
                ? `${occupancy.totalOccupied.toLocaleString()} of ${occupancy.totalBeds.toLocaleString()}`
                : undefined
            }
          />
        </div>
      )}

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-3">
          <Panel
            title="Registers still to come in"
            caption={board?.rows.length ? `as at ${CLOCK.format(new Date())}` : undefined}
            href={`/schools/attendance?date=${onDate}`}
            linkLabel="Open the register board"
          >
            {registersQuery.isPending ? (
              /*
                Three rows, and the same shape a missing register has: the class
                name, its form teacher underneath, and the "no register yet"
                tail. Anything squarer than the row it becomes reflows the panel
                the moment the board lands.
              */
              <TableRowsSkeleton
                rows={3}
                columns={[{ twoLine: true }, { width: 120, align: "right" }]}
              />
            ) : registersQuery.error ? (
              <LoadError
                what="the register board"
                error={registersQuery.error}
                onRetry={() => void registersQuery.refetch()}
              />
            ) : missing.length === 0 ? (
              board && board.rows.length === 0 && narrowing.length > 0 ? (
                <NothingMatched
                  what="year groups"
                  filters={narrowing}
                  onClear={clearFilters}
                />
              ) : board && board.rows.length === 0 ? (
                <NothingYet
                  title="No year group is expecting a register"
                  body="A register belongs to a year group with a class list. Set the year groups up under Classes and the morning fills itself in."
                />
              ) : (
                <NothingLeftToDo
                  title="Every register is in"
                  body={`All ${board?.summary.yearGroups ?? 0} year groups have sent one for ${onDate}.`}
                />
              )
            ) : (
              missing.map((row) => (
                <PanelRow
                  key={row.classId}
                  href={`/schools/attendance?date=${onDate}`}
                  lead="danger"
                  title={row.className}
                  detail={row.formTeacher?.name ?? "Unassigned — no form teacher"}
                  tail="no register yet"
                  trailing={
                    <RecordActions
                      resource="schools.attendance"
                      verbs={[
                        {
                          label: "Remind",
                          // Chasing a register is not taking one — a deputy who
                          // may not mark attendance still has to be able to ask
                          // for it, so this is the office's `edit`, not
                          // `capture`.
                          action: "edit",
                          loading:
                            remind.isPending && remind.variables?.classId === row.classId,
                          unavailable: row.formTeacher
                            ? undefined
                            : "Nobody teaches this year group yet, so there is nobody to remind.",
                          onSelect: () => {
                            setReminded(null);
                            remind.mutate(row);
                          },
                        },
                      ]}
                    />
                  }
                />
              ))
            )}
          </Panel>

          <Panel title="Waiting on somebody">
            {/*
              Five counts from five different endpoints. They land at five
              different moments, so the panel waits for all of them rather than
              filling itself in a line at a time — a row reading "—" that turns
              into "12" a second later is a number somebody has already read
              and believed.
            */}
            {waitingPending ? (
              <TableRowsSkeleton
                rows={5}
                columns={[{ twoLine: true }, { width: 60, align: "right" }]}
              />
            ) : (
              <>
                <PanelRow
                  href="/schools/results/moderation"
                  lead="warn"
                  title="Mark sheets in moderation"
                  detail="Submitted, nobody has approved them yet"
                  tail={sheetsQuery.data?.pagination.total ?? "—"}
                />
                {closingWindow ? (
                  <PanelRow
                    href="/schools/results/publish"
                    lead="warn"
                    title={`Publish window closes on ${SHORT_DAY.format(new Date(String(closingWindow.closeAt)))}`}
                    detail={`${closingWindow.term?.name ?? "This term"} · sheets not yet approved`}
                    tail={sheetsQuery.data?.pagination.total ?? "—"}
                  />
                ) : null}
                <PanelRow
                  href="/schools/admissions"
                  lead="warn"
                  title="Admissions to decide"
                  detail="Applied, no decision recorded"
                  tail={admissionsQuery.data?.applications.length ?? "—"}
                />
                <PanelRow
                  href="/schools/homework"
                  lead="danger"
                  title="Homework past its deadline"
                  detail="Work still missing from the class list"
                  tail={homework?.summary.overdue ?? "—"}
                />
                <PanelRow
                  href="/schools/goals"
                  lead="neutral"
                  title="Pupils with no subject target"
                  detail="Nobody has set these children anything"
                  tail={goalsQuery.data?.summary.withoutGoal ?? "—"}
                />
              </>
            )}
          </Panel>

          <Panel
            title="Homework overdue"
            caption="this week"
            href="/schools/homework"
            linkLabel="All homework"
          >
            {homeworkQuery.isPending ? (
              <TableRowsSkeleton
                rows={3}
                columns={[{ twoLine: true }, { width: 130, align: "right" }]}
              />
            ) : homeworkQuery.error ? (
              <LoadError
                what="the overdue homework"
                error={homeworkQuery.error}
                onRetry={() => void homeworkQuery.refetch()}
              />
            ) : overdueHomework.length === 0 ? (
              (homework?.rows ?? []).length === 0 && narrowing.length > 0 ? (
                <NothingMatched
                  what="homework"
                  filters={narrowing}
                  onClear={clearFilters}
                />
              ) : (homework?.rows ?? []).length === 0 ? (
                <NothingYet
                  title="No homework has been set this term"
                  body="Anything a teacher sets appears here once its deadline has passed with work still missing."
                />
              ) : (
                <NothingLeftToDo
                  title="Nothing is overdue"
                  body="Every piece of work set this term is either in or not yet due."
                />
              )
            ) : (
              overdueHomework.map((row) => (
                <PanelRow
                  key={row.id}
                  href="/schools/homework"
                  title={`${row.subjectName} · ${row.className}${row.streamName ? row.streamName : ""}`}
                  detail={row.title}
                  tail={
                    <span className="flex items-center gap-3">
                      <span>{row.dueAt ? SHORT_DAY.format(new Date(row.dueAt)) : "—"}</span>
                      <span>
                        {row.handedIn} of {row.onRoll}
                      </span>
                    </span>
                  }
                />
              ))
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-3">
          <Card
            title={`Fees, ${term?.name ?? "this term"}`}
            actions={
              <Button asChild variant="quiet" size="sm">
                <Link href="/schools/reports">Reports</Link>
              </Button>
            }
          >
            {collectionsQuery.isPending || arrearsQuery.isPending ? (
              <StatsSkeleton count={3} />
            ) : collectionsQuery.error || arrearsQuery.error ? (
              /*
                Scoped to the card, not the page. The registers above and the
                boarding numbers below are perfectly good answers; a page-wide
                alert would throw them away to report the one that failed.
              */
              <LoadError
                what="the fee figures"
                error={collectionsQuery.error ?? arrearsQuery.error}
                onRetry={() => {
                  void collectionsQuery.refetch();
                  void arrearsQuery.refetch();
                }}
              />
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <Figure
                    label="Invoiced"
                    value={formatSchoolMoney(collections?.totalInvoiced ?? 0)}
                  />
                  <Figure
                    label="Collected"
                    value={formatSchoolMoney(collections?.totalCollected ?? 0)}
                    tone="var(--tone-success)"
                  />
                  <Figure
                    label="Still owing"
                    value={formatSchoolMoney(arrears?.totalOutstanding ?? 0)}
                    tone="var(--tone-danger)"
                  />
                </div>
                <AgingBars aging={arrears?.aging ?? null} />
                <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                  {arrears
                    ? `${arrears.studentsWithArrears.toLocaleString()} families owe something.`
                    : "Nothing is owed."}
                </p>
              </div>
            )}
          </Card>

          <Panel title="This week">
            {thisWeekPending ? (
              <TableRowsSkeleton
                rows={3}
                columns={[{ twoLine: true }, { width: 78, badge: true }]}
              />
            ) : (
              <>
                {nextMeeting ? (
                  <PanelRow
                    href="/schools/meetings"
                    title={
                      nextMeeting.first.student?.currentClass
                        ? `Parents' evening, ${nextMeeting.first.student.currentClass.name}`
                        : "Parents' evening"
                    }
                    detail={`${nextMeeting.free} slots free of ${nextMeeting.total} · ${SHORT_DAY.format(new Date(nextMeeting.first.startsAt))} ${CLOCK.format(new Date(nextMeeting.first.startsAt))}`}
                    trailing={<Badge tone="success">Open</Badge>}
                  />
                ) : null}
                {(noticesQuery.data?.data ?? []).slice(0, 3).map((notice) => (
                  <PanelRow
                    key={notice.id}
                    href="/schools/notices"
                    title={notice.title}
                    detail={`Sent ${SHORT_DAY.format(new Date(notice.createdAt))} · read by ${notice.read.toLocaleString()} of ${notice.recipients.toLocaleString()}`}
                    trailing={severityBadge(notice.severity)}
                  />
                ))}
                {libraryQuery.data ? (
                  <PanelRow
                    href="/schools/library"
                    title="Library books past their return date"
                    detail={`${libraryQuery.data.loans.filter((loan) => loan.isOverdue).length} out past their return date`}
                    trailing={<Badge tone="outline">Notice</Badge>}
                  />
                ) : null}
                {!nextMeeting &&
                (noticesQuery.data?.data ?? []).length === 0 &&
                !libraryQuery.data ? (
                  <NothingLeftToDo
                    title="Nothing is booked this week"
                    body="No parents' evenings, no notices out and nothing overdue at the library."
                  />
                ) : null}
              </>
            )}
          </Panel>

          <Panel title="Boarding" href="/schools/boarding" linkLabel="Open boarding">
            {boardingPending ? (
              <TableRowsSkeleton
                rows={2}
                columns={[{}, { width: 90, align: "right" }]}
              />
            ) : occupancyQuery.error ? (
              <LoadError
                what="the boarding numbers"
                error={occupancyQuery.error}
                onRetry={() => void occupancyQuery.refetch()}
              />
            ) : occupancy && occupancy.totalBeds === 0 ? (
              /*
                A day school has no hostels, and that is not a missing record —
                but it is also not "nothing left to do", so it offers the verb
                that would fill it and stops there.
              */
              <NothingYet
                title="No beds have been set up"
                body="A boarding house is a hostel with rooms and beds in it. Add one under Boarding and this panel starts counting."
                action={
                  <Button asChild variant="secondary">
                    <Link href="/schools/boarding/hostels">Open boarding houses</Link>
                  </Button>
                }
              />
            ) : (
              <>
                <PanelRow
                  href="/schools/boarding"
                  title="Beds occupied"
                  tail={
                    occupancy
                      ? `${occupancy.totalOccupied} of ${occupancy.totalBeds}`
                      : "—"
                  }
                />
                <PanelRow
                  href="/schools/boarding"
                  title="Out on leave tonight"
                  tail={leaveQuery.data?.data.length ?? "—"}
                />
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function severityBadge(severity: string) {
  if (severity === "CRITICAL") return <Badge tone="danger">Urgent</Badge>;
  if (severity === "WARNING") return <Badge tone="warn">Important</Badge>;
  return <Badge tone="outline">Notice</Badge>;
}

/**
 * How old the debt is, as five bars.
 *
 * Heights are relative to the tallest bucket rather than to the total, because
 * the question is which bucket is the problem, and a bucket holding a tenth of
 * the debt is invisible when every bar is drawn against the whole.
 */
function AgingBars({
  aging,
}: {
  aging: ArrearsSummary["summary"]["aging"] | null;
}) {
  const buckets = [
    { label: "Now", value: aging?.current ?? 0 },
    { label: "1–30", value: aging?.days30 ?? 0 },
    { label: "31–60", value: aging?.days60 ?? 0 },
    { label: "61–90", value: aging?.days90 ?? 0 },
    { label: "90+", value: aging?.days120Plus ?? 0, worst: true },
  ];
  const tallest = Math.max(...buckets.map((bucket) => bucket.value), 1);

  return (
    <div>
      <div className="mb-1.5 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
        How old the debt is
      </div>
      <div className="flex items-end gap-2">
        {buckets.map((bucket) => (
          <div key={bucket.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-[62px] items-end" title={formatSchoolMoney(bucket.value)}>
              <span
                className="w-[15px] rounded-t-[3px]"
                style={{
                  height: `${Math.max(Math.round((bucket.value / tallest) * 58), bucket.value > 0 ? 4 : 2)}px`,
                  background: bucket.worst
                    ? "var(--tone-danger)"
                    : "var(--tone-warn)",
                }}
              />
            </div>
            <span className="whitespace-nowrap text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
              {bucket.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
