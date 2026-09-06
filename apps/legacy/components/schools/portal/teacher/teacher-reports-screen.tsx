"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Button,
  Card,
  Chart,
  DayList,
  EmptyState,
  StatCard,
} from "@corelithzw/react";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import {
  LoadError,
  NothingLeftToDo,
  NothingMatched,
  NothingYet,
  SaveError,
  SavingOverlay,
  StatsSkeleton,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
import { useTeacherPortal } from "./teacher-portal-context";

type AttendanceCounts = {
  sessions: number;
  recorded: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  rate: number | null;
};

type ClassReport = {
  classSubjectId: string;
  classId: string;
  className: string;
  streamName: string | null;
  subjectName: string;
  size: number;
  attendance: AttendanceCounts;
  marks: {
    scheme: string;
    passMark: number;
    marked: number;
    unmarked: number;
    average: number | null;
    passed: number;
    bands: Array<{ grade: string; minScore: number; maxScore: number; count: number }>;
  };
  homework: {
    assignments: number;
    expected: number;
    handedIn: number;
    late: number;
    rate: number | null;
  };
};

type Report = {
  termId: string;
  classes: ClassReport[];
  weeks: Array<{
    weekStart: string;
    recorded: number;
    present: number;
    late: number;
    rate: number | null;
  }>;
  atRisk: Array<{
    studentId: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    className: string | null;
    streamName: string | null;
    attendanceRate: number | null;
    recorded: number;
    lowestMark: number | null;
    lowestSubject: string | null;
    reasons: string[];
  }>;
  totals: {
    attendance: AttendanceCounts;
    homework: {
      assignments: number;
      expected: number;
      handedIn: number;
      late: number;
      rate: number | null;
    };
    marked: number;
    roll: number;
    passed: number;
    average: number | null;
  };
};

type Payload = {
  term: { id: string; code: string; name: string } | null;
  report: Report | null;
};

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

/** "3 June 2026", from a `YYYY-MM-DD` key, without touching the local clock. */
function formatDay(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return `${day} ${MONTHS[(month ?? 1) - 1]} ${year}`;
}

/** A rate as a whole percentage, or an em dash when there is nothing to divide. */
function percent(rate: number | null) {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

function className(row: { className: string; streamName: string | null }) {
  return `${row.className}${row.streamName ? ` ${row.streamName}` : ""}`;
}

/** A number that can be opened into the list it was counted from. */
function Figure({
  href,
  label,
  children,
  onClick,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      {...(onClick ? { onClick } : {})}
      className="font-[family-name:var(--font-mono)] font-semibold tabular-nums text-[color:var(--text-strong)] underline decoration-[color:var(--border)] underline-offset-4"
    >
      {children}
    </Link>
  );
}

/**
 * Reports: how the teacher's own classes are doing this term.
 *
 * The demo's version is four headline numbers, a trend, a distribution and a
 * list of children to worry about — the right shape, because a report screen a
 * teacher opens between lessons has to end in something to do. So every figure
 * here is a link into the list it was counted from: an attendance rate opens
 * the register, an average opens the marks book, a hand-in rate opens the
 * homework.
 *
 * What the demo shows and this does not: deltas against last term, a
 * distinctions count, and a week/term/year range switch. None of the three is
 * computable from what the school records — marks are held per term against
 * assessments, so there is no previous-term figure to subtract and no weekly
 * mark to slice — and a number invented to fill a tile is worse than a tile
 * that is not there.
 *
 * The trend chart scales to its own data rather than to 0–100, which is the
 * design system's behaviour and would otherwise read as a collapse when
 * attendance moves two points. The range it covers is printed under it so the
 * shape is read with the numbers rather than instead of them.
 */
export function TeacherReportsScreen() {
  const { day, error: portalError, classSubjectId, setClassSubjectId } = useTeacherPortal();
  const queryClient = useQueryClient();
  /**
   * The at-risk list is the one part of this screen a teacher acts on, and it
   * runs long in a bad week. Narrowing it by reason is how "who is missing
   * registers" gets separated from "who is failing" without reading twenty
   * rows of small print.
   */
  const [reason, setReason] = useState<"ALL" | "ATTENDANCE" | "MARKS">("ALL");
  const [told, setTold] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schools", "portal", "teacher", "reports", day.term?.id ?? null],
    queryFn: () => fetchJson<Payload>("/api/v2/schools/portal/teacher/me/reports"),
    enabled: Boolean(day.teacher),
  });

  const report = query.data?.report ?? null;
  const classes = report?.classes ?? [];
  const totals = report?.totals ?? null;
  const weeks = (report?.weeks ?? []).slice(-8);
  const selected =
    classes.find((row) => row.classSubjectId === classSubjectId) ?? classes[0] ?? null;

  const rates = weeks
    .map((week) => week.rate)
    .filter((rate): rate is number => rate !== null);
  const lowest = rates.length > 0 ? Math.min(...rates) : null;
  const highest = rates.length > 0 ? Math.max(...rates) : null;

  const atRisk = useMemo(() => report?.atRisk ?? [], [report]);
  const shownAtRisk = useMemo(() => {
    if (reason === "ALL") return atRisk;
    return atRisk.filter((person) =>
      reason === "ATTENDANCE"
        ? person.attendanceRate !== null && person.attendanceRate < 0.8
        : person.lowestMark !== null && person.lowestMark < 40,
    );
  }, [atRisk, reason]);

  /**
   * The verb this screen was missing. Before it, the at-risk list named six
   * children and left the teacher to find six phone numbers — the same dead
   * end the arrears board had. A notice addressed to one child's guardians
   * reaches them in the portal they already read.
   */
  const tell = useMutation({
    mutationFn: (person: { studentId: string; firstName: string; lastName: string }) =>
      fetchJson<{ recipients: number }>("/api/v2/schools/notices", {
        method: "POST",
        body: JSON.stringify({
          title: `${person.firstName} ${person.lastName} — this term so far`,
          body: `We would like to talk about how ${person.firstName} is getting on this term. Please reply here or ask at the office for a time to come in.`,
          audience: "PARENTS",
          studentIds: [person.studentId],
          severity: "WARNING",
        }),
      }),
    onSuccess: (result, person) => {
      setTold(
        result.recipients === 0
          ? `${person.firstName}'s family has never been invited to the portal, so there was nowhere to send it. The office can invite them.`
          : `Sent to ${result.recipients} ${result.recipients === 1 ? "guardian" : "guardians"} of ${person.firstName} ${person.lastName}.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["schools", "notices"] });
    },
  });

  if (portalError) {
    return <LoadError what="your portal" error={portalError} />;
  }

  if (!day.teacher) {
    return (
      <EmptyState
        title="You are not linked to a teacher profile"
        body="Ask the school office to link your account to your staff record. Reports are built from the classes you teach, so there is nothing to count until then."
      />
    );
  }

  if (!day.term) {
    return (
      <EmptyState
        title="No term is running"
        body="The school has no active term. Registers, marks and homework are all counted within one, so there is nothing to report on yet."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {query.error ? (
        <LoadError
          what="your reports"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : null}
      {tell.error ? <SaveError what="That message" error={tell.error} /> : null}
      {told ? (
        <Alert tone="success" title={told} onDismiss={() => setTold(null)} />
      ) : null}

      <div>
        <h2 className="text-[length:var(--type-h3)] font-semibold text-[color:var(--text-strong)]">
          Your classes this term
        </h2>
        <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
          {day.term.name} · counted from the registers you have taken, the marks
          you have entered and the homework you have set
        </p>
      </div>

      {query.isPending ? (
        /* Four tiles then the class table, in that order — the same two
           shapes the loaded screen has, so nothing jumps when it lands. */
        <div className="flex flex-col gap-4">
          <StatsSkeleton count={4} />
          <TableRowsSkeleton
            headers={["Class", "Attendance", "Average", "Passing", "Homework in"]}
            columns={[
              { twoLine: true },
              { width: 110, align: "right" },
              { width: 100, align: "right" },
              { width: 100, align: "right" },
              { width: 120, align: "right" },
            ]}
            rows={5}
          />
        </div>
      ) : classes.length === 0 ? (
        <NothingYet
          title="No classes are assigned to you this term"
          body="Reports are built from your timetabled classes. Ask the office to assign you to one and the numbers appear here."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Attendance"
              value={<span className="tabular-nums">{percent(totals?.attendance.rate ?? null)}</span>}
              tone={
                (totals?.attendance.rate ?? 1) < 0.9 ? "warn" : "neutral"
              }
              footer={`${totals?.attendance.sessions ?? 0} registers taken`}
            />
            <StatCard
              label="At or above the pass mark"
              value={
                <span className="tabular-nums">
                  {totals && totals.marked > 0
                    ? percent(totals.passed / totals.marked)
                    : "—"}
                </span>
              }
              footer={`${totals?.passed ?? 0} of ${totals?.marked ?? 0} marked`}
            />
            <StatCard
              label="Average term mark"
              value={
                <span className="tabular-nums">
                  {totals?.average === null || totals?.average === undefined
                    ? "—"
                    : `${Math.round(totals.average)}%`}
                </span>
              }
              footer={`${totals?.marked ?? 0} of ${totals?.roll ?? 0} on the rolls`}
            />
            <StatCard
              label="Homework handed in"
              value={<span className="tabular-nums">{percent(totals?.homework.rate ?? null)}</span>}
              tone={(totals?.homework.rate ?? 1) < 0.8 ? "warn" : "neutral"}
              footer={`${totals?.homework.assignments ?? 0} set this term`}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              title="Attendance week by week"
              subtitle={
                weeks.length === 0
                  ? undefined
                  : `${weeks.length} week${weeks.length === 1 ? "" : "s"} of registers · ${percent(lowest)} to ${percent(highest)}`
              }
            >
              {weeks.length === 0 ? (
                <EmptyState
                  title="No registers yet"
                  body="A week appears here as soon as one of your classes has a register taken in it."
                />
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="overflow-x-auto">
                    <Chart.Line
                      className="w-full"
                      height={140}
                      role="img"
                      aria-label={`Weekly attendance, ${percent(lowest)} to ${percent(highest)} across ${weeks.length} weeks`}
                      data={weeks.map((week) => ({
                        x: week.weekStart,
                        y: Math.round((week.rate ?? 0) * 100),
                      }))}
                    />
                  </div>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1">
                    {weeks.map((week) => (
                      <li
                        key={week.weekStart}
                        className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]"
                      >
                        <span className="font-[family-name:var(--font-mono)] tabular-nums text-[color:var(--text-body)]">
                          {percent(week.rate)}
                        </span>{" "}
                        w/c {formatDay(week.weekStart)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>

            <Card
              title={
                selected
                  ? `Marks · ${className(selected)} ${selected.subjectName}`
                  : "Marks"
              }
              subtitle={
                selected
                  ? `${selected.marks.scheme} · ${selected.marks.marked} of ${selected.size} marked · pass mark ${selected.marks.passMark}%`
                  : undefined
              }
            >
              {!selected || selected.marks.marked === 0 ? (
                <EmptyState
                  title="Nothing marked yet"
                  body="A grade appears here for every child once an assessment for this class has scores against it."
                />
              ) : (
                <DayList
                  items={selected.marks.bands.map((band) => ({
                    date: band.grade,
                    label: `${band.minScore}–${band.maxScore}%`,
                    value: (
                      <span className="font-[family-name:var(--font-mono)] tabular-nums">
                        {band.count}
                      </span>
                    ),
                    tone:
                      band.minScore >= selected.marks.passMark
                        ? ("up" as const)
                        : band.maxScore < selected.marks.passMark
                          ? ("down" as const)
                          : ("neutral" as const),
                  }))}
                />
              )}
            </Card>
          </div>

          <Card
            title="Class by class"
            subtitle="Every figure opens the list it was counted from"
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse">
                <caption className="sr-only">
                  Attendance, marks and homework for each of your classes this term
                </caption>
                <thead>
                  <tr className="border-b border-[color:var(--border)]">
                    <th className="py-2 text-left text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Class
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Attendance
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Average
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Passing
                    </th>
                    <th className="py-2 text-right text-[length:var(--type-caption)] uppercase text-[color:var(--text-subtle)]">
                      Homework in
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {classes.map((row) => (
                    <tr
                      key={row.classSubjectId}
                      className="border-b border-[color:var(--border-subtle)] last:border-b-0"
                    >
                      <td className="py-2">
                        <p className="text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                          {className(row)} · {row.subjectName}
                        </p>
                        <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                          {row.size} on the roll · {row.attendance.sessions} registers ·{" "}
                          {row.homework.assignments} pieces of homework
                        </p>
                      </td>
                      <td className="py-2 text-right">
                        <Figure
                          href="/portal/teacher/attendance"
                          label={`Open the register for ${className(row)} ${row.subjectName}`}
                          onClick={() => setClassSubjectId(row.classSubjectId)}
                        >
                          {percent(row.attendance.rate)}
                        </Figure>
                        <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                          {row.attendance.absent} absent · {row.attendance.late} late
                        </p>
                      </td>
                      <td className="py-2 text-right">
                        <Figure
                          href="/portal/teacher/marks-book"
                          label={`Open the marks book for ${className(row)} ${row.subjectName}`}
                          onClick={() => setClassSubjectId(row.classSubjectId)}
                        >
                          {row.marks.average === null
                            ? "—"
                            : `${Math.round(row.marks.average)}%`}
                        </Figure>
                        <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                          {row.marks.unmarked} not marked
                        </p>
                      </td>
                      <td className="py-2 text-right">
                        <Figure
                          href="/portal/teacher/marks-book"
                          label={`Open the marks book to see who is passing in ${className(row)} ${row.subjectName}`}
                          onClick={() => setClassSubjectId(row.classSubjectId)}
                        >
                          {row.marks.marked === 0
                            ? "—"
                            : percent(row.marks.passed / row.marks.marked)}
                        </Figure>
                        <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                          {row.marks.passed} of {row.marks.marked}
                        </p>
                      </td>
                      <td className="py-2 text-right">
                        <Figure
                          href="/portal/teacher/homework"
                          label={`Open the homework set for ${className(row)} ${row.subjectName}`}
                          onClick={() => setClassSubjectId(row.classSubjectId)}
                        >
                          {percent(row.homework.rate)}
                        </Figure>
                        <p className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                          {row.homework.handedIn} of {row.homework.expected} ·{" "}
                          {row.homework.late} late
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title="Children to look at"
            subtitle="In for less than 80% of their registers, or holding a term mark under 40%"
            actions={
              atRisk.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: "ALL", label: `All ${atRisk.length}` },
                      { value: "ATTENDANCE", label: "Missing registers" },
                      { value: "MARKS", label: "Low marks" },
                    ] as const
                  ).map((option) => (
                    <Button
                      key={option.value}
                      size="sm"
                      variant={reason === option.value ? "primary" : "secondary"}
                      onClick={() => setReason(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              ) : null
            }
          >
            {atRisk.length === 0 ? (
              /* Good news, so no create button — there is nothing to create. */
              <NothingLeftToDo
                title="Nobody is flagged"
                body="Every child on your rolls is in for most of their registers and above 40% wherever you have marked them."
              />
            ) : shownAtRisk.length === 0 ? (
              <NothingMatched
                what="children"
                filters={[reason === "ATTENDANCE" ? "missing registers" : "low marks"]}
                onClear={() => setReason("ALL")}
              />
            ) : (
              /* Writing to a family rewrites nothing on screen, but the list is
                 where the button lives — it stops taking taps so the same
                 message is not sent twice to the same household. */
              <SavingOverlay saving={tell.isPending} label="Sending…">
                <ul className="flex flex-col rounded-[var(--radius-md)] border border-[color:var(--border)]">
                  {shownAtRisk.map((person) => (
                    <li
                      key={person.studentId}
                      className="flex flex-wrap items-center gap-3 border-b border-[color:var(--border-subtle)] px-4 py-3 last:border-b-0"
                    >
                      <PersonAvatar
                        firstName={person.firstName}
                        lastName={person.lastName}
                        size="xs"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[length:var(--type-body-sm)] font-medium text-[color:var(--text-strong)]">
                          {person.lastName}, {person.firstName}
                        </p>
                        <p className="truncate font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          {person.studentNo}
                          {person.className
                            ? ` · ${person.className}${person.streamName ? ` ${person.streamName}` : ""}`
                            : ""}
                        </p>
                      </div>
                      <p className="text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-body)]">
                        {person.reasons.join(" · ")}
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        loading={tell.isPending && tell.variables?.studentId === person.studentId}
                        onClick={() => {
                          setTold(null);
                          tell.mutate(person);
                        }}
                      >
                        Write to the family
                      </Button>
                    </li>
                  ))}
                </ul>
              </SavingOverlay>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
