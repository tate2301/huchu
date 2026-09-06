"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { FilterSelect } from "@/components/schools/common/filter-select";
import { PersonAvatar } from "@corelithzw/ui/components/person-avatar";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  StatsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
import { fetchTeacherAssignments } from "@/lib/schools/admin-v2";
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

/**
 * The sick bay's own log, which is the fourth thing that happens to a child in
 * a school week and the one the record page could never show. `/health` is
 * gated on `schools.boarding` rather than `schools.students` — it is medical
 * information — so the query is allowed to 403 and the card simply carries no
 * welfare rows for somebody who may not read them.
 */
type HealthResponse = {
  record: { id: string } | null;
  events: Array<{
    id: string;
    kind: "SANATORIUM_VISIT" | "MEDICATION" | "INJURY" | "REFERRAL" | "SCREENING";
    summary: string;
    treatment: string | null;
    occurredAt: string;
  }>;
};

/** What this pupil has out of the library, and when it was due back. */
type LoansResponse = {
  data: Array<{
    id: string;
    borrowedAt: string;
    dueAt: string;
    isOverdue: boolean;
    copy: { id: string; copyCode: string; book: { id: string; title: string } };
  }>;
};

/** The paperwork on file, which the canvas draws as a card of its own. */
type DocumentsResponse = {
  data: Array<{
    id: string;
    name: string;
    url: string;
    note: string | null;
    createdAt: string;
  }>;
};

/**
 * How a document's own note says it expires.
 *
 * `CrmRecordFile` has one free-text `note` and no expiry column, and adding one
 * belongs to whoever owns the shared record engine — not to this card. So the
 * convention is the note itself: an office types "Expires 12 Sep" on the
 * medical consent, and the card reads it back and counts it. A note that says
 * nothing about expiry simply is not counted, which is the honest reading.
 */
const EXPIRY_NOTE = /\bexpires?\b/i;

/** Sick bay, in the words a nurse's log uses rather than the enum's. */
const HEALTH_EVENT_LABEL: Record<string, string> = {
  SANATORIUM_VISIT: "Sick bay visit",
  MEDICATION: "Medication given",
  INJURY: "Injury recorded",
  REFERRAL: "Referred on",
  SCREENING: "Screening",
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

/**
 * The six things that happen to a child in a school week, as a filter on the
 * timeline. Somebody preparing for a guardian meeting is reading one of them —
 * the marks, or the fees — and thirty rows of morning registers is what buries
 * it.
 */
const ACTIVITY_KINDS = [
  { value: "register", label: "Registers" },
  { value: "marks", label: "Marks" },
  { value: "fees", label: "Fees" },
  { value: "boarding", label: "Boarding" },
  { value: "welfare", label: "Welfare" },
  { value: "library", label: "Library" },
];

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

  /**
   * The sick bay's log. Read behind `schools.boarding`, so a bursar looking at
   * the same page gets a 403 here and no welfare rows — which is the right
   * answer, not a fault. `retry: false` so the refusal is taken the first time
   * rather than asked three more times.
   */
  const health = useQuery({
    queryKey: ["schools", "students", student.id, "health"],
    queryFn: () => fetchJson<HealthResponse>(`/api/v2/schools/health/${student.id}`),
    retry: false,
  });

  /** What they have out of the library, for the timeline and for the fact list. */
  const loans = useQuery({
    queryKey: ["schools", "students", student.id, "loans"],
    queryFn: () =>
      fetchJson<LoansResponse>(`/api/v2/schools/library/loans?studentId=${student.id}&limit=20`),
    retry: false,
  });

  /**
   * The paperwork. Fetched here rather than handed down from the record page:
   * the Documents card and the Documents tab both want it, and one query key
   * shared between them means opening the tab does not re-read what the
   * overview already has.
   */
  const documents = useQuery({
    queryKey: ["records", "files", "STUDENT", student.id],
    queryFn: () =>
      fetchJson<DocumentsResponse>(
        `/api/v2/records/files?subjectType=STUDENT&subjectId=${student.id}`,
      ),
  });

  /**
   * Who teaches each subject to this pupil's class.
   *
   * A mark row carries a subject code and a score and nothing about the person
   * who wrote it, which makes "who do I ring about the Accounts mark" a
   * question the record page could not answer. The class's own assignments are
   * the join: one read, indexed by subject code, so the marks table can name
   * the teacher beside the mark and spell out what the code stands for.
   */
  const teaching = useQuery({
    queryKey: ["schools", "students", student.id, "teaching", student.currentClass?.id],
    queryFn: () =>
      fetchTeacherAssignments({
        classId: student.currentClass?.id,
        limit: 100,
        isActive: true,
      }),
    enabled: Boolean(student.currentClass?.id),
  });

  /**
   * Subject code → the subject's full name and the teacher's short form.
   *
   * "R. Makoni" rather than "Rudo Makoni": a mark sheet has a column an inch
   * wide and every staff room in the country writes an initial and a surname.
   */
  const bySubject = useMemo(() => {
    const index = new Map<string, { name: string; teacher: string | null }>();
    for (const assignment of teaching.data?.data ?? []) {
      if (index.has(assignment.subject.code)) continue;
      const full = assignment.teacherProfile.user.name?.trim() ?? "";
      const parts = full.split(/\s+/).filter(Boolean);
      const short =
        parts.length > 1
          ? `${parts[0].charAt(0).toUpperCase()}. ${parts[parts.length - 1]}`
          : full || null;
      index.set(assignment.subject.code, { name: assignment.subject.name, teacher: short });
    }
    return index;
  }, [teaching.data]);

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
  /** What that earlier term is called, so the timeline can name it. */
  let previousTermName: string | null = null;
  for (const line of marks) {
    if (line.sheet?.term?.name === termName) continue;
    if (previousTermName === null) previousTermName = line.sheet?.term?.name ?? null;
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
  const [activityKind, setActivityKind] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  /**
   * Decisions somebody has looked at and set aside for now.
   *
   * Held in the page rather than written back, and that is the design: a
   * decision here is *read off* the record — a mark that fell, a bill unpaid —
   * so there is nothing to tick. Persisting a dismissal would mean storing an
   * override that quietly hides a real problem from the next person to open
   * the record. Setting it aside clears the card for this sitting; the fact
   * that raised it is still true tomorrow, and says so again.
   */
  const [dismissed, setDismissed] = useState<string[]>([]);

  /**
   * Asking a family to come in about one of the decisions below.
   *
   * "Book a meeting" opens the meetings board with a slot to choose, which is
   * the school's half of the conversation. This is the family's half: a notice
   * to whoever is on this child's record, so the parent knows to expect the
   * call rather than finding a booking in their portal with no explanation.
   */
  const askThemIn = useMutation({
    mutationFn: (decision: { title: string; body: string }) =>
      fetchJson<{ recipients: number }>("/api/v2/schools/notices", {
        method: "POST",
        body: JSON.stringify({
          title: `${name} — ${decision.title.toLowerCase()}`,
          body: `${decision.body} The school would like to speak with you about it. Please contact the office to arrange a time.`,
          audience: "PARENTS",
          studentIds: [student.id],
          severity: "WARNING",
        }),
      }),
    onSuccess: (result) => {
      setAsked(
        result.recipients === 0
          ? "Nobody on this child's record has a portal account, so the message reached no one."
          : `Sent to ${result.recipients} ${result.recipients === 1 ? "guardian" : "guardians"}.`,
      );
    },
  });

  const allActivity = [
    ...(attendance.data?.recent ?? []).map((entry) => ({
      kind: "register",
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
      const subject = bySubject.get(line.subjectCode);
      // "down 9 on Term 1" rather than "on the term before": the term the
      // comparison is against is known, and naming it is what makes the line
      // readable out loud to a parent.
      const against = previousTermName ?? "the term before";
      return {
        kind: "marks",
        at: line.createdAt,
        title:
          drop === null
            ? `${line.subjectCode} mark entered: ${Math.round(line.score)}`
            : `${line.subjectCode} mark entered: ${Math.round(line.score)} — ${drop < 0 ? `down ${Math.abs(drop)}` : `up ${drop}`} on ${against}`,
        meta: subject?.teacher ?? line.sheet?.title ?? "Marks",
      };
    }),
    ...(student.feeInvoices ?? []).map((invoice) => ({
      kind: "fees",
      at: invoice.issueDate,
      title:
        toNumber(invoice.balanceAmount) === 0
          ? `${invoice.term?.name ?? "Term"} fees settled in full, ${formatSchoolMoney(invoice.totalAmount, invoice.currency)}`
          : `${invoice.term?.name ?? "Term"} fees invoiced, ${formatSchoolMoney(invoice.balanceAmount, invoice.currency)} outstanding`,
      meta: `Bursary · invoice ${invoice.invoiceNo}`,
    })),
    ...(student.boardingAllocations ?? []).map((allocation) => ({
      kind: "boarding",
      at: allocation.startDate,
      title: `Moved into ${allocation.hostel?.name ?? "the hostel"}${allocation.bed ? `, bed ${allocation.bed.code}` : ""}`,
      meta: "Boarding",
    })),
    // The sick bay. Absent entirely for a reader without the welfare grant,
    // because `health` 403s for them and `data` stays undefined.
    ...(health.data?.events ?? []).map((event) => ({
      kind: "welfare",
      at: event.occurredAt,
      title: `${HEALTH_EVENT_LABEL[event.kind] ?? "Welfare"} — ${event.summary}`,
      meta: event.treatment ?? "Sick bay",
    })),
    ...(loans.data?.data ?? []).map((loan) => ({
      kind: "library",
      at: loan.borrowedAt,
      title: `${loan.isOverdue ? "Library book overdue" : "Library book out"}: ${loan.copy.book.title}`,
      meta: "Library",
    })),
  ]
    .filter((entry) => {
      const time = new Date(entry.at).getTime();
      return !Number.isNaN(time) && time >= since;
    })
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Six is what fits beside the rail without the card becoming the page. The
  // cap is applied after narrowing, so filtering to Marks shows six marks
  // rather than whichever marks survived a cut made against the registers.
  const activity = allActivity
    .filter((entry) => !activityKind || entry.kind === activityKind)
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
    const subject = bySubject.get(line.subjectCode);
    decisions.push({
      id: `mark-${line.id}`,
      title: `${subject?.name ?? line.subjectCode} has fallen two grades`,
      body: `${Math.round(line.score)} this term against ${Math.round(before)} last. ${
        subject?.teacher
          ? `${subject.teacher} has flagged it for a guardian conversation before reports publish.`
          : "The subject teacher has flagged it for a guardian conversation before reports publish."
      }`,
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

  /** What is still on the card after this sitting's dismissals. */
  const openDecisions = decisions.filter((decision) => !dismissed.includes(decision.id));

  /**
   * The paperwork, and how much of it is running out.
   *
   * A document is counted as expiring when its own note says so — see
   * `EXPIRY_NOTE`. "6 on file · 1 expiring" is the subtitle the canvas draws,
   * and both halves are counted rather than assumed.
   */
  const files = documents.data?.data ?? [];
  const expiring = files.filter((file) => file.note && EXPIRY_NOTE.test(file.note));

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
                  {/* Who wrote the mark. A subject code and a number is not
                      enough to act on: the next move after a mark that fell is
                      to ring the person who entered it. */}
                  <th className="px-4 py-2 font-medium">Teacher</th>
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
                  const subject = bySubject.get(line.subjectCode);
                  return (
                    <tr
                      key={line.id}
                      className="border-b border-[color:var(--border-subtle)] last:border-b-0"
                    >
                      {/* The subject's name where the timetable knows it —
                          "Combined Science" rather than "CSC". The code is the
                          fallback, not the label. */}
                      <td className="px-4 py-2">{subject?.name ?? line.subjectCode}</td>
                      <td className="px-4 py-2 text-[color:var(--text-muted)]">
                        {subject?.teacher ?? "—"}
                      </td>
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

        {allActivity.length > 0 ? (
          <Card
            title="Recent activity"
            subtitle="last 30 days"
            actions={
              // Only offered once there is enough to bury something. Four rows
              // do not need narrowing; a boarder's month of registers does.
              allActivity.length > 6 ? (
                <FilterSelect
                  label="Show"
                  allLabel="Everything"
                  value={activityKind}
                  options={ACTIVITY_KINDS}
                  onChange={setActivityKind}
                  className="min-w-0 basis-[170px]"
                />
              ) : undefined
            }
          >
            {activity.length === 0 ? (
              <NothingMatched
                what="entries"
                filters={[
                  ACTIVITY_KINDS.find((kind) => kind.value === activityKind)?.label ?? "",
                  "the last 30 days",
                ].filter(Boolean)}
                onClear={() => setActivityKind("")}
              />
            ) : (
              <ul className="space-y-2">
                {activity.map((entry, index) => (
                  <li
                    key={`${entry.at}-${index}`}
                    className="campus-row-in flex items-baseline gap-3 border-b border-[color:var(--border-subtle)] pb-2 last:border-b-0 last:pb-0"
                    style={{ animationDelay: `${index * 40}ms` }}
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
            )}
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

        {openDecisions.length > 0 ? (
          <Card
            title="Needs a decision"
            subtitle={`${openDecisions.length} open`}
            tone="warn"
          >
            <div className="space-y-2">
              {/* One write, one place to report it. The Alerts below carry the
                  verb; a refusal shown on each of them would say the same thing
                  three times. */}
              {askThemIn.isError ? (
                <SaveError what="The message to the family" error={askThemIn.error} />
              ) : null}
              {asked ? (
                <p className="campus-fade-in text-[length:var(--type-body-sm)] text-[color:var(--text-muted)]">
                  {asked}
                </p>
              ) : null}

              {openDecisions.map((decision) => (
                <Alert
                  key={decision.id}
                  tone="warn"
                  title={decision.title}
                  actions={
                    <span className="flex flex-wrap items-center gap-2">
                      <Button asChild variant="secondary" size="sm">
                        <Link href={`/schools/meetings?student=${student.id}`}>
                          Book a meeting
                        </Link>
                      </Button>
                      {/* Booking puts a slot in the diary; this is what tells
                          the family there is something to come in about. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={askThemIn.isPending}
                        onClick={() => {
                          setAsked(null);
                          askThemIn.mutate(decision);
                        }}
                      >
                        Tell the family
                      </Button>
                      {/* Set aside for this sitting. See `dismissed` — nothing
                          is written, so a fact that is still true is raised
                          again the next time the record is opened. */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDismissed((current) => [...current, decision.id])
                        }
                      >
                        Dismiss
                      </Button>
                    </span>
                  }
                >
                  {decision.body}
                </Alert>
              ))}
            </div>
          </Card>
        ) : null}

        {/*
          Documents. The same rows the Documents tab lists, summarised: what is
          on file and what is running out. It is a card and not a count because
          the two questions a counter asks — "have we got the birth
          certificate" and "is the medical consent still good" — are answered
          by seeing the names, not the number.
        */}
        <Card
          title="Documents"
          subtitle={
            documents.isPending
              ? undefined
              : `${files.length} on file${expiring.length > 0 ? ` · ${expiring.length} expiring` : ""}`
          }
          actions={
            <Button variant="ghost" size="sm" onClick={() => onOpenSection("files")}>
              Documents
            </Button>
          }
        >
          {documents.isPending ? (
            <StatsSkeleton count={1} />
          ) : documents.error ? (
            <LoadError
              what="this pupil's paperwork"
              error={documents.error}
              onRetry={() => void documents.refetch()}
            />
          ) : files.length === 0 ? (
            <NothingYet
              title="Nothing attached"
              body="A birth certificate, a previous school report, an immunisation card — anything that arrived on paper and belongs with this child."
            />
          ) : (
            <ul className="space-y-2">
              {files.slice(0, 6).map((file, index) => {
                const runningOut = Boolean(file.note && EXPIRY_NOTE.test(file.note));
                return (
                  <li
                    key={file.id}
                    className="campus-row-in flex items-baseline justify-between gap-3"
                    style={{ animationDelay: `${index * 40}ms` }}
                  >
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-[length:var(--type-body-sm)] hover:underline"
                    >
                      {file.name}
                    </a>
                    {/* The note where there is one, because that is where an
                        office writes "Expires 12 Sep". "Verified" is what a
                        document with nothing said against it means. */}
                    <span
                      className={`shrink-0 text-[length:var(--type-caption)] ${
                        runningOut
                          ? "text-[color:var(--tone-warn)]"
                          : "text-[color:var(--text-muted)]"
                      }`}
                    >
                      {file.note ?? "Verified"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

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
