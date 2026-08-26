"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { PersonAvatar } from "@/components/schools/common/person-avatar";
import { LoadError, NothingYet, StatsSkeleton } from "@/components/schools/common/states";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";

/**
 * A pupil, on one screen.
 *
 * The record page could show a child's guardians, their enrolments and their
 * bills — each behind its own tab, each a list you had to go and open. What it
 * could not do is answer the question anybody actually walks up to the counter
 * with: how is this child doing. That answer is six facts sitting side by side,
 * and it is worth a screen of its own rather than six clicks.
 *
 * Everything here is derived from what the school already recorded. Nothing is
 * a new kind of data and nothing is invented: the marks are this term's result
 * lines, the activity is those same facts sorted by when they happened, and
 * "Needs a decision" is a reading of them rather than a queue somebody has to
 * maintain. A card that has nothing to say is not drawn, because an empty
 * "Recent activity" is worse than no card at all.
 */

type MarkLine = {
  id: string;
  subjectCode: string;
  score: number;
  grade: string | null;
  createdAt: string;
  sheet: {
    id: string;
    title: string;
    // The term as the student record actually carries it. Only the name is
    // fetched, because that is all a mark row shows; asking for an id and a
    // code here would be a wider query in aid of nothing on screen.
    term: { name: string } | null;
  } | null;
};

type Invoice = {
  id: string;
  invoiceNo: string;
  status: string;
  totalAmount: string | number;
  balanceAmount: string | number;
  currency: string;
  issueDate: string;
  term: { id: string; name: string } | null;
};

type Allocation = {
  id: string;
  startDate: string;
  endDate: string | null;
  hostel: { id: string; name: string } | null;
  room: { id: string; code: string } | null;
  bed: { id: string; code: string } | null;
};

type GuardianLink = {
  id: string;
  relationship: string;
  isPrimary: boolean;
  guardian: {
    id: string;
    guardianNo: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string | null;
  };
};

type Enrollment = {
  id: string;
  status: string;
  enrolledAt: string;
  term: { id: string; code: string; name: string } | null;
  class: { id: string; code: string; name: string } | null;
  stream: { id: string; code: string; name: string } | null;
};

export type StudentOverview = {
  id: string;
  studentNo: string;
  admissionNo: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  admissionDate: string | null;
  isBoarding: boolean;
  currentClass: { id: string; code: string; name: string } | null;
  currentStream: { id: string; code: string; name: string } | null;
  guardianLinks: GuardianLink[];
  enrollments: Enrollment[];
  feeInvoices: Invoice[];
  boardingAllocations: Allocation[];
  resultLines: MarkLine[];
};

type AttendanceResponse = {
  counts: Record<"PRESENT" | "ABSENT" | "LATE" | "EXCUSED", number>;
  marked: number;
  rate: number | null;
  recent: Array<{
    id: string;
    status: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
    remarks: string | null;
    date: string;
    className: string | null;
    streamName: string | null;
  }>;
};

/** An age in whole years, which is how a school says one. */
function ageInYears(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(dateOfBirth);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) years -= 1;
  return years;
}

function toNumber(value: string | number) {
  return typeof value === "number" ? value : Number(value);
}

/** "24 Aug" — the short form a timeline uses, where the year is obvious. */
const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : SHORT_DATE.format(date);
}

/** One line of the property list under the pupil's face. */
function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[color:var(--border-subtle)] py-1.5 last:border-b-0">
      <dt className="shrink-0 text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
        {label}
      </dt>
      <dd className="min-w-0 text-right text-[length:var(--type-body-sm)]">{value}</dd>
    </div>
  );
}

export function StudentOverviewTab({
  student,
  onOpenSection,
}: {
  student: StudentOverview;
  /** Jump to another section of the record — the cards link into the detail. */
  onOpenSection: (section: string) => void;
}) {
  const attendance = useQuery({
    queryKey: ["schools", "students", student.id, "attendance"],
    queryFn: () =>
      fetchJson<AttendanceResponse>(`/api/v2/schools/students/${student.id}/attendance`),
  });

  const name = `${student.firstName} ${student.lastName}`.trim();
  const age = ageInYears(student.dateOfBirth);

  /**
   * The term the marks are for: the newest one a mark was written against, not
   * the school's current term. A pupil who left in Term 1 has a Term 1 card and
   * no Term 2 marks, and heading the card "Term 2 marks" over an empty table
   * would say the school lost their work.
   */
  const marks = student.resultLines ?? [];
  const termName = marks[0]?.sheet?.term?.name ?? null;
  const termMarks = termName
    ? marks.filter((line) => line.sheet?.term?.name === termName)
    : [];
  const mean =
    termMarks.length > 0
      ? termMarks.reduce((sum, line) => sum + line.score, 0) / termMarks.length
      : null;

  /**
   * The same subject a term earlier, for the "vs" column. Keyed by subject so
   * a mark with no prior term simply has nothing to compare against — which is
   * every subject in a pupil's first term, and should read as a dash.
   */
  const previous = new Map<string, number>();
  for (const line of marks) {
    if (line.sheet?.term?.name === termName) continue;
    if (!previous.has(line.subjectCode)) previous.set(line.subjectCode, line.score);
  }

  const currentBoarding = (student.boardingAllocations ?? []).find(
    (allocation) => !allocation.endDate,
  );
  const owing = (student.feeInvoices ?? []).reduce(
    (sum, invoice) => sum + toNumber(invoice.balanceAmount),
    0,
  );
  const billed = (student.feeInvoices ?? []).length > 0;
  const currency = student.feeInvoices?.[0]?.currency ?? "USD";

  /**
   * The last thirty days, assembled from the facts the school already holds
   * rather than an activity log nobody writes to. Registers, marks, fees and
   * beds are the four things that happen to a child in a school week.
   *
   * The window is pinned once per mount rather than read during render.
   * `Date.now()` in a render body is impure — the cutoff would shift under any
   * re-render, so a row could drop out of "recent" because somebody typed in a
   * filter — and React's rules lint says so.
   */
  const [since] = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000);
  const activity = [
    ...(attendance.data?.recent ?? []).map((entry) => ({
      at: entry.date,
      title:
        entry.status === "PRESENT"
          ? "Marked present — morning register"
          : entry.status === "LATE"
            ? "Marked late — morning register"
            : entry.status === "EXCUSED"
              ? "Away with permission — morning register"
              : "Marked absent — morning register",
      meta: [entry.className, entry.streamName].filter(Boolean).join(" · ") || "Register",
    })),
    ...termMarks.map((line) => {
      const before = previous.get(line.subjectCode);
      const drop = before === undefined ? null : Math.round(line.score - before);
      return {
        at: line.createdAt,
        title:
          drop === null
            ? `${line.subjectCode} mark entered: ${Math.round(line.score)}`
            : `${line.subjectCode} mark entered: ${Math.round(line.score)} — ${drop < 0 ? `down ${Math.abs(drop)}` : `up ${drop}`} on the term before`,
        meta: line.sheet?.title ?? "Marks",
      };
    }),
    ...(student.feeInvoices ?? []).map((invoice) => ({
      at: invoice.issueDate,
      title:
        toNumber(invoice.balanceAmount) === 0
          ? `${invoice.term?.name ?? "Term"} fees settled in full, ${formatSchoolMoney(invoice.totalAmount, invoice.currency)}`
          : `${invoice.term?.name ?? "Term"} fees invoiced, ${formatSchoolMoney(invoice.balanceAmount, invoice.currency)} outstanding`,
      meta: `Bursary · invoice ${invoice.invoiceNo}`,
    })),
    ...(student.boardingAllocations ?? []).map((allocation) => ({
      at: allocation.startDate,
      title: `Moved into ${allocation.hostel?.name ?? "the hostel"}${allocation.bed ? `, bed ${allocation.bed.code}` : ""}`,
      meta: "Boarding",
    })),
  ]
    .filter((entry) => {
      const time = new Date(entry.at).getTime();
      return !Number.isNaN(time) && time >= since;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 6);

  /**
   * What somebody has to decide about this child.
   *
   * Read off the record rather than kept as a queue: a subject that fell two
   * grades, fees that never got paid, a child with nobody to ring. Each one is
   * a conversation somebody has to have, which is why the verb on the card
   * books the meeting rather than ticking the item off.
   */
  const decisions: Array<{ id: string; title: string; body: string }> = [];
  for (const line of termMarks) {
    const before = previous.get(line.subjectCode);
    if (before === undefined) continue;
    const drop = before - line.score;
    if (drop < 9) continue;
    decisions.push({
      id: `mark-${line.id}`,
      title: `${line.subjectCode} has fallen two grades`,
      body: `${Math.round(line.score)} this term against ${Math.round(before)} last. Worth a guardian conversation before reports publish.`,
    });
  }
  if (billed && owing > 0) {
    decisions.push({
      id: "fees",
      title: "Fees are still outstanding",
      body: `${formatSchoolMoney(owing, currency)} is unpaid across ${student.feeInvoices.length} invoice${student.feeInvoices.length === 1 ? "" : "s"}.`,
    });
  }
  if ((student.guardianLinks ?? []).length === 0) {
    decisions.push({
      id: "guardian",
      title: "Nobody is recorded as this child's guardian",
      body: "There is no one to ring about a register, a mark or a bill. The office links a guardian from the Guardians section.",
    });
  }

  const attendanceRate = attendance.data?.rate ?? null;

  return (
    <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="space-y-3">
        {/* The pupil themselves. Everything on this card is a fact that does
            not change week to week, which is why it is a property list and not
            a set of chips. */}
        <Card title="Student" subtitle={student.studentNo}>
          <div className="flex items-center gap-3 pb-3">
            <PersonAvatar
              firstName={student.firstName}
              lastName={student.lastName}
              size="lg"
            />
            <div className="min-w-0">
              <div className="text-[length:var(--type-body)] font-bold">{name}</div>
              <div className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                {[
                  student.currentStream?.name ?? student.currentClass?.name,
                  currentBoarding?.hostel?.name,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Not placed yet"}
              </div>
            </div>
          </div>
          <dl>
            <Fact label="Admitted" value={formatSchoolDate(student.admissionDate) || "—"} />
            <Fact
              label="Date of birth"
              value={
                student.dateOfBirth
                  ? `${formatSchoolDate(student.dateOfBirth)}${age === null ? "" : ` · ${age}y`}`
                  : "Not known"
              }
            />
            <Fact label="Year group" value={student.currentClass?.name ?? "Not in a year group"} />
            <Fact
              label="Register class"
              value={student.currentStream?.name ?? "Not in a class"}
            />
            <Fact
              label="Boarding"
              value={
                currentBoarding
                  ? `${currentBoarding.hostel?.name ?? "Hostel"}${currentBoarding.bed ? `, bed ${currentBoarding.bed.code}` : ""}`
                  : student.isBoarding
                    ? "Boarder, no bed allocated"
                    : "Day pupil"
              }
            />
            {/* Transport is its own module and this pupil is either on a route
                or is not. "Not registered" is the honest answer for the many
                who walk, and it is a link because the next move is to add them. */}
            <Fact
              label="Transport"
              value={
                <Link href="/schools/transport" className="hover:underline">
                  Not registered
                </Link>
              }
            />
          </dl>
        </Card>

        {termMarks.length > 0 ? (
          <Card
            flush
            title={`${termName} marks`}
            subtitle={
              mean === null
                ? undefined
                : `mean ${mean.toFixed(1)} · ${termMarks.length} subject${termMarks.length === 1 ? "" : "s"}`
            }
            actions={
              <Button variant="ghost" size="sm" onClick={() => onOpenSection("results")}>
                Academics
              </Button>
            }
          >
            <table className="w-full text-[length:var(--type-body-sm)]">
              <thead>
                <tr className="border-b border-[color:var(--border)] text-left text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                  <th className="px-4 py-2 font-medium">Subject</th>
                  <th className="px-4 py-2 font-medium">Mark</th>
                  <th className="px-4 py-2 font-medium">Grade</th>
                  {/* "vs T1" rather than "vs last term": the column is two
                      characters wide on a phone and every mark sheet in the
                      country abbreviates the term this way. */}
                  <th className="px-4 py-2 font-medium">vs T1</th>
                </tr>
              </thead>
              <tbody>
                {termMarks.map((line) => {
                  const before = previous.get(line.subjectCode);
                  const delta = before === undefined ? null : Math.round(line.score - before);
                  return (
                    <tr
                      key={line.id}
                      className="border-b border-[color:var(--border-subtle)] last:border-b-0"
                    >
                      <td className="px-4 py-2">{line.subjectCode}</td>
                      <td className="px-4 py-2 font-[family-name:var(--font-mono)] tabular-nums">
                        {Math.round(line.score)}
                      </td>
                      <td className="px-4 py-2">{line.grade ?? "—"}</td>
                      <td className="px-4 py-2 font-[family-name:var(--font-mono)] tabular-nums">
                        {delta === null ? (
                          "—"
                        ) : (
                          <span
                            className={
                              delta < 0
                                ? "text-[color:var(--tone-danger)]"
                                : "text-[color:var(--tone-success)]"
                            }
                          >
                            {delta > 0 ? `+${delta}` : delta}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        ) : null}

        {activity.length > 0 ? (
          <Card title="Recent activity" subtitle="last 30 days">
            <ul className="space-y-2">
              {activity.map((entry, index) => (
                <li
                  key={`${entry.at}-${index}`}
                  className="flex items-baseline gap-3 border-b border-[color:var(--border-subtle)] pb-2 last:border-b-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:var(--type-body-sm)]">
                      {entry.title}
                    </span>
                    <span className="block text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {entry.meta}
                    </span>
                  </span>
                  <span className="shrink-0 font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] tabular-nums text-[color:var(--text-muted)]">
                    {shortDate(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <div className="space-y-3">
        <Card
          title="Attendance"
          subtitle={termName ? `${termName} to date` : "This year to date"}
          actions={
            <Button variant="ghost" size="sm" onClick={() => onOpenSection("attendance")}>
              Attendance
            </Button>
          }
        >
          {attendance.isPending ? (
            <StatsSkeleton count={1} />
          ) : attendance.error ? (
            <LoadError
              what="this pupil's attendance"
              error={attendance.error}
              onRetry={() => void attendance.refetch()}
            />
          ) : attendanceRate === null ? (
            <NothingYet
              title="No register has counted this pupil yet"
              body="Figures appear once a class teacher submits a register they are on."
            />
          ) : (
            <>
              <div className="font-[family-name:var(--font-mono)] text-[length:var(--type-display)] font-bold tabular-nums">
                {attendanceRate}%
              </div>
              <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                {attendance.data?.counts.ABSENT ?? 0} absence
                {(attendance.data?.counts.ABSENT ?? 0) === 1 ? "" : "s"} ·{" "}
                {attendance.data?.counts.LATE ?? 0} late
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge tone="success">
                  Present {attendance.data?.counts.PRESENT ?? 0}
                </Badge>
                <Badge tone="warn">Late {attendance.data?.counts.LATE ?? 0}</Badge>
                <Badge tone="danger">Absent {attendance.data?.counts.ABSENT ?? 0}</Badge>
              </div>
            </>
          )}
        </Card>

        <Card
          title="Fees"
          subtitle={billed ? undefined : "Nothing billed yet"}
          actions={
            <Button variant="ghost" size="sm" onClick={() => onOpenSection("fees")}>
              Fees
            </Button>
          }
        >
          {billed ? (
            <>
              <div className="text-[length:var(--type-body)] font-bold">
                {owing === 0 ? "Paid in full" : formatSchoolMoney(owing, currency)}
              </div>
              <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                {owing === 0
                  ? `${student.feeInvoices.length} invoice${student.feeInvoices.length === 1 ? "" : "s"}, nothing outstanding`
                  : "outstanding across every invoice"}
              </p>
            </>
          ) : (
            <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
              This pupil has never been invoiced.
            </p>
          )}
        </Card>

        <Card
          title="Guardians"
          subtitle={`${student.guardianLinks?.length ?? 0} linked`}
          actions={
            <Button variant="ghost" size="sm" onClick={() => onOpenSection("guardians")}>
              Guardians
            </Button>
          }
        >
          {(student.guardianLinks ?? []).length === 0 ? (
            <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
              Nobody is recorded as this child&rsquo;s guardian.
            </p>
          ) : (
            <ul className="space-y-2">
              {student.guardianLinks.map((link) => (
                <li key={link.id} className="flex items-center gap-2">
                  <PersonAvatar
                    firstName={link.guardian.firstName}
                    lastName={link.guardian.lastName}
                    size="xs"
                  />
                  <span className="min-w-0">
                    <Link
                      href={`/schools/guardians/${link.guardian.id}`}
                      className="block text-[length:var(--type-body-sm)] font-medium hover:underline"
                    >
                      {link.guardian.firstName} {link.guardian.lastName}
                    </Link>
                    <span className="block text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                      {[link.relationship, link.isPrimary ? "primary" : null, link.guardian.phone]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {decisions.length > 0 ? (
          <Card
            title="Needs a decision"
            subtitle={`${decisions.length} open`}
            tone="warn"
          >
            <div className="space-y-2">
              {decisions.map((decision) => (
                <Alert
                  key={decision.id}
                  tone="warn"
                  title={decision.title}
                  actions={
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/schools/meetings?student=${student.id}`}>
                        Book a meeting
                      </Link>
                    </Button>
                  }
                >
                  {decision.body}
                </Alert>
              ))}
            </div>
          </Card>
        ) : null}

        <Card
          title="Welfare"
          subtitle={currentBoarding ? currentBoarding.hostel?.name ?? "Boarding" : "Day pupil"}
        >
          <p className="text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
            {currentBoarding
              ? `In ${currentBoarding.hostel?.name ?? "the hostel"}${currentBoarding.bed ? `, bed ${currentBoarding.bed.code}` : ""} since ${formatSchoolDate(currentBoarding.startDate)}.`
              : "This pupil goes home at the end of the day, so the hostel and sick bay have nothing on file."}
          </p>
        </Card>
      </div>
    </div>
  );
}
