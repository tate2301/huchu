"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { customFieldAttributes } from "@/components/records/custom-field-attributes";
import { EntityLink } from "@/components/records/entity-link";
import { RecordAttributes, type RecordAttribute } from "@/components/records/record-attributes";
import { RecordMark } from "@/components/records/record-mark";
import {
  RailSection,
  RecordPageShell,
  RecordRelated,
  RelatedList,
  type RecordTab,
} from "@/components/records/record-page-shell";
import { useAttributeEditor } from "@/components/records/use-attribute-editor";
import { PrintDocumentButton } from "@/components/schools/common/print-document-button";
import { SubjectNotes, type SubjectNote } from "@/components/records/subject-tabs";
import { FilterSelect } from "@/components/schools/common/filter-select";
import { RecordActions } from "@/components/schools/common/record-actions";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
} from "@/components/schools/common/states";
import {
  Glance,
  GlanceList,
  RecordLoadFailure,
  RecordPageSkeleton,
} from "@/components/schools/records/record-page-parts";
import {
  RecordFilesTab,
  type RecordFile,
} from "@/components/schools/records/record-files-tab";
import { StudentPortalPanel } from "@/components/schools/records/student-portal-panel";
import { StudentAttendanceTab } from "@/components/schools/records/student-attendance-tab";
import { StudentOverviewTab } from "@/components/schools/records/student-overview-tab";
import {
  StudentFormSheet,
  type StudentFormValues,
} from "@/components/schools/students/student-form-sheet";
import { fetchSchoolsClasses } from "@/lib/schools/admin-v2";
import {
  deleteStudent,
  updateStudent,
  type StudentRollRecord,
} from "@/lib/schools/students-v2";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { CrmFieldDefinitionRecord } from "@/lib/crm/crm-v2";
import {
  Badge,
  Calendar,
  CalendarCheck,
  FileText,
  Home,
  Tag,
  User,
  UserCheck,
  Users,
} from "@/lib/icons";
import { recordType } from "@/lib/records/registry";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";
import { normalizeUiStatus } from "@/lib/ui/status-map";

/**
 * A student, as a record.
 *
 * S-4.3. This replaces a 403-line page that composed `Card` and
 * `VerticalDataViews` by hand, with its own `InfoRow`, its own `statusBadge`,
 * its own date formatter and `const student: any`. None of that was wrong; it
 * was just the sixth independent implementation of a record page in this repo,
 * and the seventh would have been the guardian.
 *
 * Everything structural now comes from `components/records/`, which owes nothing
 * to any module: the shell, the identity strip, the property list with its
 * inline commits, and the mark. What is left here is the only part that is
 * genuinely about students — which queries to run and which relationships are
 * worth a tab.
 *
 * Notes and Files arrive via S-4.2, which re-keyed `CrmComment` and
 * `CrmRecordFile` onto `(subjectType, subjectId)` and put module-neutral routes
 * in front of them — `/api/v2/records/**`, gated per subject type rather than on
 * `crm.core` by URL prefix. Tasks and mentions are still absent: tasks want an
 * assignee-and-due-date UI that is its own piece of work, and a mention cannot be
 * created until the rich-text composer learns school record kinds (S-4.5).
 */

/* The profile endpoint's response is assembled from a deep Prisma include and
 * has never had a type. Narrowed here to the parts this page reads, rather than
 * carrying the `any` the old page did. */
type Guardian = {
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

type ResultLine = {
  id: string;
  subjectCode: string;
  score: number;
  grade: string | null;
  createdAt: string;
  sheet: { id: string; title: string; term: { name: string } | null } | null;
};

type StudentRecord = {
  id: string;
  studentNo: string;
  admissionNo: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  status: string;
  isBoarding: boolean;
  admissionDate: string | null;
  customFields: Record<string, unknown> | null;
  /** The portal account, set once the child claims their invitation. */
  userId: string | null;
  avatarUrl: string | null;
  accent: string | null;
  currentClass: { id: string; code: string; name: string } | null;
  currentStream: { id: string; code: string; name: string } | null;
  guardianLinks: Guardian[];
  enrollments: Enrollment[];
  feeInvoices: Invoice[];
  boardingAllocations: Allocation[];
  resultLines: ResultLine[];
};

const STATUS_OPTIONS = [
  { value: "APPLICANT", label: "Applicant" },
  { value: "ACTIVE", label: "On the roll" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "GRADUATED", label: "Left — completed" },
  { value: "WITHDRAWN", label: "Left — withdrawn" },
];

/**
 * The enrolment somebody is looking for, which is nearly always this year's.
 * A pupil in their fourth year carries a row per term per year, and the one
 * that matters is the one that is still open.
 */
const ENROLMENT_OPTIONS = [
  { value: "ACTIVE", label: "Current" },
  { value: "PAST", label: "Finished" },
];

export function StudentRecordPage({ studentId }: { studentId: string }) {
  const config = recordType("STUDENT");
  const router = useRouter();
  const queryClient = useQueryClient();
  // The overview is the landing view: it is the only section that answers
  // "how is this child doing" without a second click, and every other tab is
  // one of its cards opened up.
  const [activeTab, setActiveTab] = useState("overview");
  const [formOpen, setFormOpen] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [enrolmentStatus, setEnrolmentStatus] = useState("");

  const query = useQuery({
    queryKey: config.queryKey(studentId),
    queryFn: () => fetchJson<StudentRecord>(config.apiPath(studentId)),
  });

  const edit = useAttributeEditor({
    path: config.apiPath(studentId),
    invalidate: [config.queryKey(studentId), ["schools", "students"]],
  });

  const student = query.data ?? null;

  // The ladder the class and stream property rows choose from. Loaded here
  // rather than inside the attribute list so the two rows share one read.
  const classesQuery = useQuery({
    queryKey: ["schools", "grades"],
    queryFn: () => fetchSchoolsClasses({ page: 1, limit: 200 }),
  });
  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const streams = useMemo(
    () => classes.find((row) => row.id === student?.currentClass?.id)?.streams ?? [],
    [classes, student?.currentClass?.id],
  );

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: config.queryKey(studentId) });
    void queryClient.invalidateQueries({ queryKey: ["schools", "students"] });
  };

  const saveMutation = useMutation({
    mutationFn: (values: StudentFormValues) =>
      updateStudent(studentId, {
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        admissionNo: values.admissionNo.trim() || null,
        dateOfBirth: values.dateOfBirth || null,
        gender: values.gender || null,
        status: values.status,
        currentClassId: values.currentClassId || null,
        currentStreamId: values.currentStreamId || null,
        isBoarding: values.isBoarding,
        admissionDate: values.admissionDate || null,
        customFields: values.customFields,
        ...(values.studentNo.trim() ? { studentNo: values.studentNo.trim() } : {}),
      }),
    onSuccess: () => {
      setFormOpen(false);
      setActionError(null);
      refresh();
    },
    onError: (error) => setActionError(error),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateStudent(studentId, { status }),
    onSuccess: () => {
      setActionError(null);
      refresh();
    },
    onError: (error) => setActionError(error),
  });

  // A hard delete, for the record somebody created by mistake this morning.
  // The endpoint refuses the moment anything hangs off the child — a mark, a
  // register line, an invoice — which is why "take off the roll" is the verb
  // for everybody else.
  const deleteMutation = useMutation({
    mutationFn: () => deleteStudent(studentId),
    onSuccess: () => {
      refresh();
      router.push(config.indexHref);
    },
    onError: (error) => setActionError(error),
  });

  const attributes = useMemo<RecordAttribute[]>(() => {
    if (!student) return [];
    // A mark on every row, and one that means something. The property list
    // falls back to a generic tag for a row that names no icon, so a page that
    // named none at all came out as a column of identical glyphs — which is
    // the ragged column the fallback exists to avoid, drawn the other way up.
    return [
      {
        id: "studentNo",
        label: "Student number",
        icon: Badge,
        mono: true,
        ...edit.required("studentNo", student.studentNo),
      },
      {
        id: "yearGroup",
        label: "Year group",
        // Moving a child between year groups is the commonest correction the
        // office makes, and it used to be read-only here — the only way to do
        // it was a bulk roll-up over the whole school.
        ...edit.choice(
          "currentClassId",
          student.currentClass?.id ?? null,
          classes.map((row) => ({ value: row.id, label: row.name })),
          "Not in a year group",
        ),
        display: student.currentClass?.name ?? null,
        placeholder: "Not in a year group",
      },
      {
        id: "class",
        label: "Class",
        icon: Users,
        ...edit.choice(
          "currentStreamId",
          student.currentStream?.id ?? null,
          streams.map((stream) => ({ value: stream.id, label: stream.name })),
          "Not in a class",
        ),
        display: student.currentStream?.name ?? null,
        placeholder: student.currentClass ? "Not in a class" : "Choose a year group first",
      },
      {
        id: "status",
        label: "Status",
        icon: Tag,
        ...edit.choice("status", student.status, STATUS_OPTIONS),
      },
      {
        id: "dateOfBirth",
        label: "Date of birth",
        icon: Calendar,
        kind: "date",
        value: student.dateOfBirth ? student.dateOfBirth.slice(0, 10) : null,
        formatted: formatSchoolDate(student.dateOfBirth),
        placeholder: "Not known",
        onCommit: (next: string) =>
          edit.save.mutate({ dateOfBirth: next.trim() === "" ? null : next }),
      },
      {
        id: "gender",
        label: "Gender",
        icon: User,
        ...edit.text("gender", student.gender ?? ""),
      },
      {
        id: "admissionNo",
        label: "Admission number",
        // The paperwork mark rather than the badge: the student number is who
        // they are here, this is the reference on the form they came in on.
        icon: FileText,
        mono: true,
        ...edit.text("admissionNo", student.admissionNo ?? ""),
      },
      {
        id: "admissionDate",
        label: "Admitted",
        icon: CalendarCheck,
        kind: "date",
        value: student.admissionDate ? student.admissionDate.slice(0, 10) : null,
        formatted: formatSchoolDate(student.admissionDate),
        placeholder: "Not recorded",
        onCommit: (next: string) =>
          edit.save.mutate({ admissionDate: next.trim() === "" ? null : next }),
      },
      {
        id: "boarding",
        label: "Boarder",
        icon: Home,
        // A choice rather than free text: the column is a boolean, and the
        // only two answers it has are the two offered here.
        value: student.isBoarding ? "yes" : "no",
        options: [
          { value: "yes", label: "Boarder" },
          { value: "no", label: "Day pupil" },
        ],
        display: student.isBoarding ? "Boarder" : "Day pupil",
        onCommit: (next: string) => edit.save.mutate({ isBoarding: next === "yes" }),
      },
      {
        id: "portal",
        label: "Portal account",
        icon: UserCheck,
        // Read-only on purpose: an account is claimed by the child from an
        // invitation, not switched on by the office. The verb is in the rail.
        display: student.userId ? "Signed in" : "Never signed in",
      },
    ];
  }, [student, edit, classes, streams]);

  // S-4.4 — the school's own fields. Read from the schools door onto the shared
  // engine; `/api/v2/crm/field-definitions` is gated on `crm.settings`, which no
  // school has.
  const customFields = useQuery({
    queryKey: ["records", "field-definitions", "STUDENT"],
    queryFn: () =>
      fetchJson<{ data: CrmFieldDefinitionRecord[] }>(
        "/api/v2/schools/field-definitions?entity=STUDENT",
      ),
  });

  // S-4.2 — the shared record surface, reached through the module-neutral routes.
  const notes = useQuery({
    queryKey: ["records", "comments", "STUDENT", studentId],
    queryFn: () =>
      fetchJson<{ data: SubjectNote[] }>(
        `/api/v2/records/comments?subjectType=STUDENT&subjectId=${studentId}`,
      ),
  });
  const files = useQuery({
    queryKey: ["records", "files", "STUDENT", studentId],
    queryFn: () =>
      fetchJson<{ data: RecordFile[] }>(
        `/api/v2/records/files?subjectType=STUDENT&subjectId=${studentId}`,
      ),
  });

  if (query.isPending) {
    return <RecordPageSkeleton testId="student-record-loading" />;
  }

  if (query.isError || !student) {
    return (
      <RecordLoadFailure
        notFound="That pupil"
        what="this pupil's record"
        error={query.error}
        backHref={config.indexHref}
        backLabel="Back to the roll"
        onRetry={() => void query.refetch()}
      />
    );
  }

  const name = `${student.firstName} ${student.lastName}`.trim();
  const offRoll = student.status === "WITHDRAWN" || student.status === "GRADUATED";

  const visibleEnrolments = (student.enrollments ?? []).filter((enrollment) => {
    if (enrolmentStatus === "ACTIVE") return enrollment.status === "ACTIVE";
    if (enrolmentStatus === "PAST") return enrollment.status !== "ACTIVE";
    return true;
  });

  const primaryGuardian =
    (student.guardianLinks ?? []).find((link) => link.isPrimary) ??
    (student.guardianLinks ?? [])[0] ??
    null;
  const primaryGuardianEmail = primaryGuardian?.guardian.email ?? null;

  /** The house they are in tonight, which is the allocation with no end date. */
  const currentHostel =
    (student.boardingAllocations ?? []).find(
      (allocation) => !allocation.endDate && allocation.hostel,
    )?.hostel ?? null;

  /** Invoices with something still on them, which is what "does this family owe" means. */
  const outstanding = (student.feeInvoices ?? []).filter(
    (invoice) => Number(invoice.balanceAmount) > 0,
  );

  /**
   * Whether the hard delete would be refused. Mirrors the dependency check in
   * `DELETE /api/v2/schools/students/[id]` closely enough to disable the verb
   * with a reason instead of letting the server answer with a 409.
   */
  const hasHistory =
    (student.enrollments?.length ?? 0) > 0 ||
    (student.feeInvoices?.length ?? 0) > 0 ||
    (student.resultLines?.length ?? 0) > 0 ||
    (student.boardingAllocations?.length ?? 0) > 0 ||
    (student.guardianLinks?.length ?? 0) > 0;

  /**
   * The record, in the shape the create/edit form takes. The form is fed by the
   * list endpoint everywhere else; the profile endpoint returns a superset, so
   * this is a narrowing rather than a second fetch.
   */
  const formStudent: StudentRollRecord = {
    id: student.id,
    studentNo: student.studentNo,
    admissionNo: student.admissionNo,
    firstName: student.firstName,
    lastName: student.lastName,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    status: student.status,
    isBoarding: student.isBoarding,
    admissionDate: student.admissionDate,
    userId: student.userId,
    customFields: student.customFields,
    currentClass: student.currentClass,
    currentStream: student.currentStream
      ? { ...student.currentStream, classId: student.currentClass?.id ?? "" }
      : null,
    guardianLinks: [],
    _count: {
      guardianLinks: student.guardianLinks?.length ?? 0,
      enrollments: student.enrollments?.length ?? 0,
      boardingAllocations: student.boardingAllocations?.length ?? 0,
      resultLines: student.resultLines?.length ?? 0,
    },
  };

  const tabs: RecordTab[] = [
    {
      value: "overview",
      label: "Overview",
      content: (
        <StudentOverviewTab
          student={{
            ...student,
            resultLines: student.resultLines ?? [],
            guardianLinks: student.guardianLinks ?? [],
            enrollments: student.enrollments ?? [],
            feeInvoices: student.feeInvoices ?? [],
            boardingAllocations: student.boardingAllocations ?? [],
          }}
          onOpenSection={setActiveTab}
        />
      ),
    },
    {
      value: "guardians",
      label: "Guardians",
      count: student.guardianLinks?.length ?? 0,
      content:
        (student.guardianLinks ?? []).length === 0 ? (
          // A child with nobody attached is the one case on this page that
          // stops the school working — no fee notice, no result, nobody to
          // ring — so it names the verb rather than stating the absence.
          <NothingYet
            title="Nobody is recorded as this child's guardian"
            body="There is no one to ring about a register, a mark or a bill. A guardian is attached from their own record, where the consent for each child is held."
            action={
              <Button asChild variant="secondary">
                <Link href="/schools/guardians">Open guardians</Link>
              </Button>
            }
          />
        ) : (
          <RelatedList
            items={student.guardianLinks ?? []}
            emptyMessage="Nobody is recorded as this child's guardian."
            renderItem={(link) => ({
              href: recordType("GUARDIAN").href(link.guardian.id),
              title: `${link.guardian.firstName} ${link.guardian.lastName}`,
              subtitle: [link.relationship, link.guardian.phone].filter(Boolean).join(" · "),
              meta: link.isPrimary ? "Primary" : undefined,
            })}
          />
        ),
    },
    {
      value: "enrollments",
      label: "Enrolments",
      count: student.enrollments?.length ?? 0,
      content:
        (student.enrollments ?? []).length === 0 ? (
          <NothingYet
            title="No enrolment has been recorded"
            body="The year roll-up reads these, so a pupil without one has no history to carry forward. Put them in a year group and the first enrolment is written for you."
          />
        ) : (
          <div className="space-y-3">
            {/* A pupil who has been through four years has twelve enrolment
                rows and the office is looking at one of them. */}
            {(student.enrollments ?? []).length > 3 ? (
              <FilterSelect
                label="Enrolment"
                allLabel="Every enrolment"
                value={enrolmentStatus}
                options={ENROLMENT_OPTIONS}
                onChange={setEnrolmentStatus}
              />
            ) : null}

            {visibleEnrolments.length === 0 ? (
              <NothingMatched
                what="enrolments"
                filters={[
                  ENROLMENT_OPTIONS.find((option) => option.value === enrolmentStatus)?.label ??
                    "",
                ].filter(Boolean)}
                onClear={() => setEnrolmentStatus("")}
              />
            ) : (
              <RelatedList
                items={visibleEnrolments}
                emptyMessage="No enrolment has been recorded."
                renderItem={(enrollment) => ({
                  href: enrollment.class
                    ? recordType("CLASS").href(enrollment.class.id)
                    : config.href(student.id),
                  title: enrollment.class?.name ?? "No class",
                  subtitle: [enrollment.term?.name, enrollment.stream?.name]
                    .filter(Boolean)
                    .join(" · "),
                  meta:
                    enrollment.status === "ACTIVE" ? "Current" : enrollment.status.toLowerCase(),
                })}
              />
            )}
          </div>
        ),
    },
    {
      value: "attendance",
      label: "Attendance",
      content: <StudentAttendanceTab studentId={student.id} studentName={name} />,
    },
    {
      value: "fees",
      label: "Fees",
      count: student.feeInvoices?.length ?? 0,
      content:
        (student.feeInvoices ?? []).length === 0 ? (
          <NothingYet
            title="Nothing has been billed to this pupil"
            body="Fees are raised against a year group a term at a time, so a pupil with no invoice is usually one who joined after the term's billing run."
            action={
              <Button asChild variant="secondary">
                <Link href="/schools/fees">Open fees</Link>
              </Button>
            }
          />
        ) : (
          <RelatedList
            items={student.feeInvoices ?? []}
            emptyMessage="Nothing has been billed to this pupil."
            renderItem={(invoice) => ({
              href: `/schools/finance?invoice=${invoice.id}`,
              title: invoice.invoiceNo,
              subtitle: [invoice.term?.name, formatSchoolDate(invoice.issueDate)]
                .filter(Boolean)
                .join(" · "),
              meta: `${formatSchoolMoney(invoice.balanceAmount, invoice.currency)} outstanding`,
            })}
          />
        ),
    },
    // Dropped by the shell when the array is empty, rather than advertising an
    // empty Welfare tab for a day pupil, who has no hostel and no sick bay
    // entry to show.
    ...(student.boardingAllocations?.length
      ? [
          {
            value: "boarding",
            label: "Welfare",
            count: student.boardingAllocations.length,
            content: (
              <RelatedList
                items={student.boardingAllocations}
                emptyMessage="No bed has been allocated."
                renderItem={(allocation) => ({
                  href: allocation.hostel
                    ? recordType("HOSTEL").href(allocation.hostel.id)
                    : "/schools/boarding",
                  title: allocation.hostel?.name ?? "Hostel",
                  subtitle: [allocation.room?.code, allocation.bed?.code]
                    .filter(Boolean)
                    .join(" · "),
                  meta: allocation.endDate ? "Ended" : "Current",
                })}
              />
            ),
          } satisfies RecordTab,
        ]
      : []),
    {
      value: "notes",
      label: "Notes",
      count: notes.data?.data?.length ?? 0,
      // Scoped to the tab. Notes failing must not take the overview with it —
      // that is the half of the record somebody is at the counter for.
      content: notes.error ? (
        <LoadError
          what="this pupil's notes"
          error={notes.error}
          onRetry={() => void notes.refetch()}
        />
      ) : (
        <SubjectNotes
          subject={{ type: "STUDENT", id: studentId }}
          notes={notes.data?.data ?? []}
          isPending={notes.isPending}
        />
      ),
    },
    {
      value: "files",
      // "Documents" rather than "Files": what a school keeps here is a birth
      // certificate and a medical consent, and nobody at a counter asks for
      // a child's files.
      label: "Documents",
      count: files.data?.data?.length ?? 0,
      content: (
        <RecordFilesTab
          subjectType="STUDENT"
          subjectId={studentId}
          resource="schools.students"
          files={files.data?.data ?? []}
          isPending={files.isPending}
          error={files.error}
          onRetry={() => void files.refetch()}
        />
      ),
    },
    ...(student.resultLines?.length
      ? [
          {
            value: "results",
            label: "Academics",
            count: student.resultLines.length,
            content: (
              <RelatedList
                items={student.resultLines}
                emptyMessage="No published results."
                renderItem={(line) => ({
                  href: `/schools/results/publish`,
                  title: line.sheet?.title ?? "Result sheet",
                  subtitle: line.sheet?.term?.name ?? null,
                })}
              />
            ),
          } satisfies RecordTab,
        ]
      : []),
  ];

  // The term the card would be for: the pupil's most recent enrolment. Not "the
  // school's current term" — a pupil who left in Term 1 has a Term 1 card and no
  // Term 2 marks, and asking for the current term would refuse with a message
  // about publishing rather than about the child.
  const latestTermId = (student.enrollments ?? [])[0]?.term?.id ?? null;

  return (
    <RecordPageShell
      backHref={config.indexHref}
      backLabel={config.labelPlural}
      title={name}
      reference={student.studentNo}
      primaryAction={
        // Iteration 5 — the two documents an office is asked for at the counter.
        // The report card needs the term, and refuses unless the school's publish
        // window is open, which is what makes it safe to put here rather than
        // behind the results screens.
        <span className="flex items-center gap-2">
          <PrintDocumentButton
            sourceKey="schools.fee.statement"
            recordId={studentId}
            label="Statement"
          />
          {latestTermId ? (
            <PrintDocumentButton
              sourceKey="schools.report-card"
              recordId={studentId}
              filters={{ termId: latestTermId }}
              label="Report card"
            />
          ) : null}
        </span>
      }
      status={{
        label: STATUS_OPTIONS.find((option) => option.value === student.status)?.label ??
          student.status,
        status: normalizeUiStatus(student.status),
      }}
      subtitle={
        // The caption the canvas draws: the register class and the pupil's own
        // number. Not "Boarder" — the badge above already says that, and this
        // line is for the two facts somebody reads off the screen down a phone.
        [student.currentStream?.name ?? student.currentClass?.name, student.studentNo]
          .filter(Boolean)
          .join(" · ") || null
      }
      leading={
        <RecordMark
          kind={config.kind}
          name={name}
          avatarUrl={student.avatarUrl}
          accent={student.accent}
          size="lg"
        />
      }
      /* The records this child is attached to, under the sections rail. Their
         class, their house and the person the school rings are three places
         somebody moves to from here constantly, and each was a fact printed on
         the page with no way through to the record behind it. One line each,
         because this answers "what is this attached to" and not "what has
         happened to it". */
      related={
        <RecordRelated
          items={[
            student.currentClass
              ? {
                  href: recordType("CLASS").href(student.currentClass.id),
                  label: student.currentStream
                    ? `${student.currentClass.name} · ${student.currentStream.name}`
                    : student.currentClass.name,
                }
              : null,
            currentHostel
              ? {
                  href: recordType("HOSTEL").href(currentHostel.id),
                  label: currentHostel.name,
                }
              : null,
            primaryGuardian
              ? {
                  href: recordType("GUARDIAN").href(primaryGuardian.guardian.id),
                  label: `${primaryGuardian.guardian.firstName} ${primaryGuardian.guardian.lastName}`,
                }
              : null,
          ].filter((item): item is { href: string; label: string } => item !== null)}
        />
      }
      attributes={
        <div className="space-y-3">
          {/* The year-group and class rows choose from this ladder, so a read
              that failed leaves two property rows that look editable and can
              only ever offer an empty list. */}
          {classesQuery.error ? (
            <LoadError
              what="the class ladder"
              error={classesQuery.error}
              onRetry={() => void classesQuery.refetch()}
            />
          ) : null}
          {/* The property list commits on blur, so a refused write leaves no
              button holding the fault. */}
          {edit.save.error ? <SaveError what="That change" error={edit.save.error} /> : null}
          <RecordAttributes
            attributes={[
              ...attributes,
              ...customFieldAttributes({
                definitions: customFields.data?.data ?? [],
                values: student.customFields,
                onCommit: (key, value) => edit.save.mutate({ customFields: { [key]: value } }),
              }),
            ]}
          />
        </div>
      }
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rail={
        <div className="space-y-6">
          {/* What the section rail cannot say. It already carries how many
              guardians, enrolments and invoices there are, so a glance list
              repeating those three was the same three numbers twice inside
              200px; what it could not say is whether the family owes anything,
              which is the question asked at the counter. */}
          <RailSection title="At a glance">
            <GlanceList>
              <Glance
                label="Guardian to ring"
                value={
                  primaryGuardian ? (
                    <EntityLink href={recordType("GUARDIAN").href(primaryGuardian.guardian.id)}>
                      {primaryGuardian.guardian.firstName} {primaryGuardian.guardian.lastName}
                    </EntityLink>
                  ) : (
                    "Nobody on file"
                  )
                }
              />
              <Glance
                label="Invoices outstanding"
                value={outstanding.length > 0 ? String(outstanding.length) : "None"}
              />
            </GlanceList>
          </RailSection>

          <RailSection title="The portal">
            <StudentPortalPanel
              studentId={studentId}
              hasAccount={Boolean(student.userId)}
              suggestedEmail={primaryGuardianEmail}
            />
          </RailSection>

          {/* The office's own verbs. In the rail rather than the app bar
              because the bar already carries the two documents a counter is
              asked for, and a row of five controls is a row nobody reads. */}
          <RailSection title="Office">
            {actionError ? <SaveError what="That change" error={actionError} /> : null}
            <RecordActions
              resource="schools.students"
              verbs={[
                {
                  label: "Edit details",
                  action: "edit",
                  onSelect: () => setFormOpen(true),
                },
                offRoll
                  ? {
                      label: "Put back on the roll",
                      action: "edit",
                      loading: statusMutation.isPending,
                      onSelect: () => statusMutation.mutate("ACTIVE"),
                    }
                  : {
                      label: "Take off the roll",
                      action: "archive",
                      tone: "danger" as const,
                      loading: statusMutation.isPending,
                      confirm: {
                        title: `Take ${name} off the roll`,
                        description:
                          "The record stays and so does everything attached to it — marks, register, fees. They stop counting towards the school's numbers and drop out of the class lists.",
                        confirmLabel: "Take off the roll",
                      },
                      onSelect: () => statusMutation.mutate("WITHDRAWN"),
                    },
                {
                  label: "Delete for good",
                  action: "archive",
                  tone: "danger" as const,
                  loading: deleteMutation.isPending,
                  // The endpoint refuses while anything references the child.
                  // Saying so here is kinder than a 409 after a confirmation.
                  unavailable: hasHistory
                    ? "There are marks, fees or registers against this child. Take them off the roll instead."
                    : undefined,
                  confirm: {
                    title: `Delete ${name}`,
                    description:
                      "The record is removed and cannot be brought back. Only a record created by mistake should go this way.",
                    confirmLabel: "Delete for good",
                  },
                  onSelect: () => deleteMutation.mutate(),
                },
              ]}
            />
          </RailSection>
        </div>
      }
    >
      <StudentFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        student={formStudent}
        isSubmitting={saveMutation.isPending}
        error={saveMutation.isError ? getApiErrorMessage(saveMutation.error) : null}
        onSubmit={(values) => saveMutation.mutate(values)}
      />
    </RecordPageShell>
  );
}
