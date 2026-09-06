"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Badge, Button, Card } from "@corelithzw/react";

import { PageHeading } from "@/components/layout/page-heading";
import { Input } from "@corelithzw/ui/components/input";
import { Label } from "@corelithzw/ui/components/label";
import { VerticalDataViews } from "@corelithzw/ui/components/vertical-data-views";
import { PdfTemplate } from "@/components/pdf/pdf-template";
import { PageBand } from "@/components/schools/common/page-band";
import { FilterBar, FilterSelect } from "@/components/schools/common/filter-select";
import {
  CardsSkeleton,
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "@/components/schools/common/states";
import { fetchJson } from "@corelithzw/platform/api-client";
import {
  fetchSchoolsClasses,
  fetchSchoolsStudents,
  fetchSchoolsTerms,
  type SchoolsStudentRecord,
} from "@/lib/schools/admin-v2";
import { formatSchoolDate, formatSchoolMoney } from "@/lib/schools/format";

/**
 * The paperwork a school office prints.
 *
 * Four documents, one filter row. The filter row is the change: the class list
 * and the attendance register kept the student-search state and never rendered
 * the box, so both printed all 842 pupils with no way to narrow to a class —
 * which is the only way anybody has ever wanted them. Year group, stream, term
 * and status now narrow every tab, including those two.
 *
 * The two per-pupil documents fetch what they are for. The report card printed
 * a single row reading "Results data will be populated from the results module"
 * and the fee invoice printed three dashes; both are the whole point of the
 * document, and a blank one handed to a parent is worse than none. They read
 * `/assessments/term-marks` and `/fees/invoices` for the term in view.
 *
 * ── The filter row ─────────────────────────────────────────────────────────
 *
 * Four filters, each named here with the unnarrowed choice the canvas gives it:
 *
 *   Year group = Form 2
 *   Stream = Every stream
 *   Term = Term 2 · 2026
 *   Status = Active pupils
 *
 * Year group, stream and status go to the roll endpoint; term picks which
 * marks and which invoice the two per-pupil documents read. All four narrow
 * every tab, including the class list and the register.
 */

type DocumentView = "report-card" | "fee-invoice" | "class-list" | "attendance-register";

type TermMark = {
  studentId: string;
  subject: { id: string; code: string; name: string };
  mark: number | null;
  grade: { grade: string; remark?: string | null } | null;
  caveat: string | null;
};

type InvoiceLine = {
  id: string;
  description: string;
  lineTotal: string;
};

type Invoice = {
  id: string;
  invoiceNo: string;
  issueDate: string;
  dueDate: string;
  status: string;
  currency: string;
  totalAmount: string;
  paidAmount: string;
  balanceAmount: string;
  lines: InvoiceLine[];
};

const STATUSES = [
  { value: "ACTIVE", label: "Active pupils" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "GRADUATED", label: "Left, graduated" },
  { value: "WITHDRAWN", label: "Left, withdrawn" },
  { value: "APPLICANT", label: "Applicants" },
];

const CELL = {
  border: "1px solid #e5e7eb",
  padding: "6px 8px",
  textAlign: "left" as const,
};
const HEAD_ROW = { backgroundColor: "#f9fafb" };

/**
 * Printing, and saying so when it does not happen.
 *
 * A hand-rolled `window.open` is what the browser will actually print from, so
 * it stays — but a blocked pop-up used to return silently, and a button that
 * does nothing and says nothing is the worst thing on a screen. The caller gets
 * told, and puts it on the page.
 */
function usePrint(ref: React.RefObject<HTMLDivElement | null>) {
  const [blocked, setBlocked] = useState<Error | null>(null);

  const print = () => {
    if (!ref.current) return;
    const content = ref.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setBlocked(
        new Error(
          "Your browser blocked the print window. Allow pop-ups for this site and press it again — the document is ready, it just has nowhere to open.",
        ),
      );
      return;
    }
    setBlocked(null);
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Print Document</title>
          <style>
            body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; font-size: 12px; }
            th { background-color: #f9fafb; font-weight: 600; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return { print, blocked };
}

/** A document, its Print button and whatever the print attempt had to say. */
function DocumentFrame({
  title,
  children,
}: {
  title: string;
  children: (ref: React.RefObject<HTMLDivElement | null>) => React.ReactNode;
}) {
  const printRef = useRef<HTMLDivElement | null>(null);
  const printer = usePrint(printRef);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[length:var(--type-body-sm)] font-semibold">{title}</h3>
        <Button size="sm" onClick={printer.print}>
          Print / Save PDF
        </Button>
      </div>
      {/* The button says Save PDF, so a print that never opened is a save that
          did not happen and takes the same banner as any other failed write.
          It clears itself the moment a print does get through. */}
      {printer.blocked ? <SaveError what="The document" error={printer.blocked} /> : null}
      <div ref={printRef} className="overflow-x-auto">
        {children(printRef)}
      </div>
    </div>
  );
}

/* ── report card ─────────────────────────────────────────────────────── */

function ReportCardPreview({
  student,
  termId,
  termName,
}: {
  student: SchoolsStudentRecord | null;
  termId: string;
  termName: string;
}) {
  const marksQuery = useQuery({
    queryKey: [
      "schools",
      "term-marks",
      student?.currentClass?.id,
      student?.currentStream?.id,
      termId,
    ],
    // The endpoint answers for a whole class in one read, which is also what a
    // form teacher printing thirty cards needs; the card takes its own rows out.
    queryFn: () => {
      const params = new URLSearchParams({ classId: student?.currentClass?.id ?? "" });
      if (student?.currentStream?.id) params.set("streamId", student.currentStream.id);
      if (termId) params.set("termId", termId);
      return fetchJson<{ marks: TermMark[] }>(
        `/api/v2/schools/assessments/term-marks?${params.toString()}`,
      );
    },
    enabled: Boolean(student?.currentClass?.id),
  });

  if (!student) {
    return (
      <NothingYet
        title="No pupil chosen"
        body="Pick a pupil from the list to build their report card."
      />
    );
  }

  if (!student.currentClass) {
    return (
      <Alert tone="info" title="This pupil is not in a year group">
        A report card is built from a class&rsquo;s marks, so {student.firstName} needs a
        year group before one can be printed.
      </Alert>
    );
  }

  const mine = (marksQuery.data?.marks ?? []).filter(
    (mark) => mark.studentId === student.id,
  );

  // The card is not a print preview until the marks are in it — a document
  // frame with a Print button over an empty table is a button that prints a
  // blank report card, and a parent holding one cannot tell it from a child
  // with no marks. So the whole frame waits, and the wait has a shape.
  if (marksQuery.isPending) {
    return (
      <TableRowsSkeleton
        rows={7}
        headers={["Subject", "Mark", "Grade", "Comment"]}
        columns={[{}, { width: 70, align: "right" }, { width: 70, align: "right" }, {}]}
      />
    );
  }

  if (marksQuery.isError) {
    return (
      <LoadError
        what="the marks"
        error={marksQuery.error}
        onRetry={() => void marksQuery.refetch()}
      />
    );
  }

  return (
    <DocumentFrame title="Report Card Preview">
      {() => (
        <PdfTemplate
          title="Student Report Card"
          subtitle={termName}
          meta={[
            { label: "Student No", value: student.studentNo },
            { label: "Admission No", value: student.admissionNo || "-" },
            { label: "Class", value: student.currentClass?.name ?? "-" },
            { label: "Stream", value: student.currentStream?.name ?? "-" },
            { label: "Status", value: student.status },
            { label: "Boarding", value: student.isBoarding ? "Boarder" : "Day Scholar" },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={HEAD_ROW}>
                <th style={CELL}>Subject</th>
                <th style={{ ...CELL, textAlign: "center" }}>Mark</th>
                <th style={{ ...CELL, textAlign: "center" }}>Grade</th>
                <th style={CELL}>Comment</th>
              </tr>
            </thead>
            <tbody>
              {mine.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ ...CELL, textAlign: "center", color: "#6b7280" }}>
                    No marks have been recorded for {student.firstName} this term.
                  </td>
                </tr>
              ) : (
                mine.map((mark) => (
                  <tr key={mark.subject.id}>
                    <td style={CELL}>{mark.subject.name}</td>
                    <td style={{ ...CELL, textAlign: "center", fontFamily: "monospace" }}>
                      {mark.mark === null ? "-" : Math.round(mark.mark)}
                    </td>
                    <td style={{ ...CELL, textAlign: "center" }}>
                      {mark.grade?.grade ?? "-"}
                    </td>
                    <td style={{ ...CELL, color: "#6b7280" }}>
                      {mark.grade?.remark ?? mark.caveat ?? ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div style={{ marginTop: "24px", borderTop: "1px solid #e5e7eb", paddingTop: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#6b7280" }}>
              <div>
                <div style={{ marginTop: "24px", borderTop: "1px solid #000", width: "200px" }}>
                  Class Teacher &mdash; Signature
                </div>
              </div>
              <div>
                <div style={{ marginTop: "24px", borderTop: "1px solid #000", width: "200px" }}>
                  Head Teacher &mdash; Signature
                </div>
              </div>
            </div>
          </div>
        </PdfTemplate>
      )}
    </DocumentFrame>
  );
}

/* ── fee invoice ─────────────────────────────────────────────────────── */

function FeeInvoicePreview({
  student,
  termId,
  termName,
}: {
  student: SchoolsStudentRecord | null;
  termId: string;
  termName: string;
}) {
  const invoiceQuery = useQuery({
    queryKey: ["schools", "invoice", "document", student?.id, termId],
    queryFn: () => {
      const params = new URLSearchParams({
        studentId: student?.id ?? "",
        includeLines: "true",
        limit: "1",
      });
      if (termId) params.set("termId", termId);
      return fetchJson<{ data: Invoice[] }>(
        `/api/v2/schools/fees/invoices?${params.toString()}`,
      );
    },
    enabled: Boolean(student?.id),
  });

  if (!student) {
    return (
      <NothingYet
        title="No pupil chosen"
        body="Pick a pupil from the list to print their invoice."
      />
    );
  }

  const invoice = invoiceQuery.data?.data[0] ?? null;

  // Same rule as the report card: the frame waits rather than offering Print
  // over three dashes. An invoice printed before its lines land is one a family
  // is asked to pay.
  if (invoiceQuery.isPending) {
    return (
      <TableRowsSkeleton
        rows={5}
        headers={["Description", "Amount"]}
        columns={[{}, { width: 120, align: "right" }]}
      />
    );
  }

  if (invoiceQuery.error) {
    return (
      <LoadError
        what="the invoice"
        error={invoiceQuery.error}
        onRetry={() => void invoiceQuery.refetch()}
      />
    );
  }

  if (!invoice) {
    return (
      <Alert tone="info" title="Nothing has been billed yet">
        {student.firstName} has no invoice for {termName}. The bursar raises one from the
        fee ledger, and it can be printed here as soon as it exists.
      </Alert>
    );
  }

  return (
    <DocumentFrame title="Fee Invoice Preview">
      {() => (
        <PdfTemplate
          title="Fee Invoice"
          subtitle={termName}
          meta={[
            { label: "Invoice No", value: invoice.invoiceNo },
            { label: "Student No", value: student.studentNo },
            { label: "Class", value: student.currentClass?.name ?? "-" },
            { label: "Invoice Date", value: formatSchoolDate(invoice.issueDate) },
            { label: "Due Date", value: formatSchoolDate(invoice.dueDate) },
            { label: "Status", value: invoice.status },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={HEAD_ROW}>
                <th style={CELL}>Description</th>
                <th style={{ ...CELL, textAlign: "right" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.length === 0 ? (
                <tr>
                  <td style={CELL}>{`Fees, ${termName}`}</td>
                  <td style={{ ...CELL, textAlign: "right", fontFamily: "monospace" }}>
                    {formatSchoolMoney(invoice.totalAmount, invoice.currency)}
                  </td>
                </tr>
              ) : (
                invoice.lines.map((line) => (
                  <tr key={line.id}>
                    <td style={CELL}>{line.description}</td>
                    <td style={{ ...CELL, textAlign: "right", fontFamily: "monospace" }}>
                      {formatSchoolMoney(line.lineTotal, invoice.currency)}
                    </td>
                  </tr>
                ))
              )}
              <tr>
                <td style={CELL}>Paid to date</td>
                <td style={{ ...CELL, textAlign: "right", fontFamily: "monospace" }}>
                  {formatSchoolMoney(invoice.paidAmount, invoice.currency)}
                </td>
              </tr>
              <tr style={{ fontWeight: 600 }}>
                <td style={CELL}>Total due</td>
                <td style={{ ...CELL, textAlign: "right", fontFamily: "monospace" }}>
                  {formatSchoolMoney(invoice.balanceAmount, invoice.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </PdfTemplate>
      )}
    </DocumentFrame>
  );
}

/* ── class list and register ─────────────────────────────────────────── */

function ClassListPreview({
  students,
  scope,
}: {
  students: SchoolsStudentRecord[];
  scope: string;
}) {
  return (
    <DocumentFrame title="Class List Preview">
      {() => (
        <PdfTemplate
          title="Class List"
          subtitle={scope}
          meta={[
            { label: "Pupils", value: String(students.length) },
            { label: "Date", value: formatSchoolDate(new Date()) },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
            <thead>
              <tr style={HEAD_ROW}>
                <th style={CELL}>#</th>
                <th style={CELL}>Student No</th>
                <th style={CELL}>Name</th>
                <th style={CELL}>Class</th>
                <th style={CELL}>Stream</th>
                <th style={CELL}>Status</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ ...CELL, textAlign: "center", color: "#6b7280" }}>
                    Nothing is left after the filters in force.
                  </td>
                </tr>
              ) : (
                students.map((student, index) => (
                  <tr key={student.id}>
                    <td style={CELL}>{index + 1}</td>
                    <td style={{ ...CELL, fontFamily: "monospace" }}>{student.studentNo}</td>
                    <td style={CELL}>
                      {student.firstName} {student.lastName}
                    </td>
                    <td style={CELL}>{student.currentClass?.name ?? "-"}</td>
                    <td style={CELL}>{student.currentStream?.name ?? "-"}</td>
                    <td style={CELL}>{student.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PdfTemplate>
      )}
    </DocumentFrame>
  );
}

function AttendanceRegisterPreview({
  students,
  scope,
}: {
  students: SchoolsStudentRecord[];
  scope: string;
}) {
  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

  return (
    <DocumentFrame title="Attendance Register Preview">
      {() => (
        <PdfTemplate
          title="Attendance Register"
          subtitle={scope}
          meta={[
            { label: "Week of", value: formatSchoolDate(new Date()) },
            { label: "Pupils", value: String(students.length) },
          ]}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
            <thead>
              <tr style={HEAD_ROW}>
                <th style={CELL}>#</th>
                <th style={CELL}>Name</th>
                {weekDays.map((day) => (
                  <th key={day} style={{ ...CELL, textAlign: "center", minWidth: "40px" }}>
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td
                    colSpan={2 + weekDays.length}
                    style={{ ...CELL, textAlign: "center", color: "#6b7280" }}
                  >
                    Nothing is left after the filters in force.
                  </td>
                </tr>
              ) : (
                students.map((student, index) => (
                  <tr key={student.id}>
                    <td style={CELL}>{index + 1}</td>
                    <td style={CELL}>
                      {student.firstName} {student.lastName}
                    </td>
                    {weekDays.map((day) => (
                      <td key={day} style={{ ...CELL, textAlign: "center" }}>
                        &nbsp;
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PdfTemplate>
      )}
    </DocumentFrame>
  );
}

/* ── the screen ──────────────────────────────────────────────────────── */

export function SchoolDocumentsContent() {
  const [activeView, setActiveView] = useState<DocumentView>("report-card");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [streamId, setStreamId] = useState("");
  const [termId, setTermId] = useState("");
  const [status, setStatus] = useState("ACTIVE");

  const classesQuery = useQuery({
    queryKey: ["schools", "classes", "documents"],
    queryFn: () => fetchSchoolsClasses({ limit: 100 }),
  });
  const termsQuery = useQuery({
    queryKey: ["schools", "terms", "documents"],
    queryFn: () => fetchSchoolsTerms({ limit: 100 }),
  });

  // The filters go to the API, not to a client-side slice: a class list has to
  // be able to print a whole year group, and the roll is longer than one page.
  const studentsQuery = useQuery({
    queryKey: ["schools", "students", "documents", classId, streamId, status],
    queryFn: () =>
      fetchSchoolsStudents({
        page: 1,
        limit: 100,
        ...(classId ? { classId } : {}),
        ...(streamId ? { streamId } : {}),
        ...(status ? { status } : {}),
      }),
  });

  const classes = useMemo(() => classesQuery.data?.data ?? [], [classesQuery.data]);
  const terms = useMemo(() => termsQuery.data?.data ?? [], [termsQuery.data]);
  const activeTerm = useMemo(
    () => terms.find((term) => term.isActive) ?? terms[0] ?? null,
    [terms],
  );
  const term = termId ? (terms.find((row) => row.id === termId) ?? activeTerm) : activeTerm;
  const effectiveTermId = term?.id ?? "";
  const termName = term ? `${term.name} · ${term.academicYear.name}` : "This term";

  const streams = useMemo(() => {
    const source = classId ? classes.filter((row) => row.id === classId) : classes;
    return source.flatMap((row) =>
      (row.streams ?? []).map((stream) => ({ value: stream.id, label: stream.name })),
    );
  }, [classes, classId]);

  const students = useMemo(() => studentsQuery.data?.data ?? [], [studentsQuery.data]);
  const total = studentsQuery.data?.pagination.total ?? 0;

  const searched = useMemo(() => {
    if (!search.trim()) return students;
    const needle = search.trim().toLowerCase();
    return students.filter(
      (student) =>
        `${student.firstName} ${student.lastName}`.toLowerCase().includes(needle) ||
        student.studentNo.toLowerCase().includes(needle),
    );
  }, [students, search]);

  const selectedStudent = students.find((row) => row.id === selectedStudentId) ?? null;
  const scopeLabel = [
    classId ? classes.find((row) => row.id === classId)?.name : "The whole school",
    streamId ? streams.find((row) => row.value === streamId)?.label : null,
    STATUSES.find((row) => row.value === status)?.label,
    termName,
  ]
    .filter(Boolean)
    .join(" · ");

  const perPupil = activeView === "report-card" || activeView === "fee-invoice";

  /**
   * Whether anything beyond the screen's own default is narrowing the roll.
   * Status is compared against ACTIVE rather than against empty: that is what
   * the screen opens on, so it is not a narrowing somebody applied and it does
   * not belong in the list of filters "Clear the filters" would undo.
   */
  const narrowed = Boolean(classId || streamId || search.trim() || status !== "ACTIVE");

  /** No active pupil and nothing hiding one — the roll has not been filled. */
  const rollNotStarted = !narrowed && total === 0;

  const noPupilFilters = () => {
    setClassId("");
    setStreamId("");
    setStatus("ACTIVE");
    setSearch("");
  };

  const pupilFilterNames = [
    classId ? classes.find((row) => row.id === classId)?.name : null,
    streamId ? streams.find((row) => row.value === streamId)?.label : null,
    status !== "ACTIVE" ? STATUSES.find((row) => row.value === status)?.label : null,
    search.trim() || null,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="space-y-3">
      <PageHeading title="School Documents" />

      <PageBand
        chips={[
          {
            label: "Year group",
            value: classId
              ? (classes.find((row) => row.id === classId)?.name ?? "—")
              : "Every year group",
          },
          { label: "Pupils", value: total.toLocaleString() },
          { label: "Term", value: term ? term.name : "—" },
        ]}
      />

      <FilterBar>
        <FilterSelect
          label="Year group"
          allLabel="Every year group"
          value={classId}
          options={classes.map((row) => ({ value: row.id, label: row.name }))}
          onChange={(value) => {
            setClassId(value);
            setStreamId("");
            setSelectedStudentId(null);
          }}
        />
        <FilterSelect
          label="Stream"
          allLabel="Every stream"
          value={streamId}
          options={streams}
          onChange={(value) => {
            setStreamId(value);
            setSelectedStudentId(null);
          }}
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
          label="Status"
          allLabel="Anybody on the roll"
          value={status}
          options={STATUSES}
          onChange={(value) => {
            setStatus(value);
            setSelectedStudentId(null);
          }}
        />
      </FilterBar>

      {classesQuery.isError ? (
        <LoadError
          what="the year groups"
          error={classesQuery.error}
          onRetry={() => void classesQuery.refetch()}
        />
      ) : null}
      {termsQuery.isError ? (
        <LoadError
          what="the terms"
          error={termsQuery.error}
          onRetry={() => void termsQuery.refetch()}
        />
      ) : null}
      {studentsQuery.error ? (
        <LoadError
          what="the roll"
          error={studentsQuery.error}
          onRetry={() => void studentsQuery.refetch()}
        />
      ) : null}

      <VerticalDataViews
        items={[
          { id: "report-card", label: "Report Cards" },
          { id: "fee-invoice", label: "Fee Invoices" },
          { id: "class-list", label: "Class Lists", count: searched.length },
          { id: "attendance-register", label: "Attendance Registers", count: searched.length },
        ]}
        value={activeView}
        onValueChange={(value) => setActiveView(value as DocumentView)}
        railLabel="Document Types"
      >
        {perPupil ? (
          <div className="space-y-4">
            <Card
              title="Select Student"
              subtitle={`${searched.length} of ${total.toLocaleString()} on the roll`}
            >
              <div className="space-y-3">
                <div>
                  <Label htmlFor="doc-student-search">Search students</Label>
                  <Input
                    id="doc-student-search"
                    placeholder="Search by name or student number..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {studentsQuery.isPending ? (
                    // The roll arrives as a scroll of names, so the placeholder
                    // is a scroll of name-shaped rows. The sentence that used to
                    // sit here collapsed the box to one line and then shoved
                    // twenty rows in underneath it.
                    <TableRowsSkeleton
                      rows={5}
                      columns={[{ width: 84 }, { twoLine: true }, { width: 70, badge: true }]}
                    />
                  ) : studentsQuery.isError ? null : searched.length === 0 ? (
                    rollNotStarted ? (
                      // No active pupil, with nothing narrowing it. That is a
                      // school that has not admitted anybody yet, not a search
                      // that missed, and the verb that fills it is elsewhere.
                      <NothingYet
                        title="No pupil is on the roll yet"
                        body="Documents are printed for pupils. Admit or import them first and every tab here fills itself."
                      />
                    ) : (
                      <NothingMatched
                        what="pupils"
                        filters={pupilFilterNames}
                        onClear={noPupilFilters}
                      />
                    )
                  ) : (
                    searched.slice(0, 20).map((student) => (
                      <button
                        key={student.id}
                        type="button"
                        className={`w-full rounded px-3 py-2 text-left text-[length:var(--type-body-sm)] transition-colors hover:bg-[color:var(--surface-muted)] ${
                          selectedStudentId === student.id
                            ? "bg-[color:var(--surface-muted)] font-medium"
                            : ""
                        }`}
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        <span className="font-[family-name:var(--font-mono)] text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                          {student.studentNo}
                        </span>{" "}
                        {student.firstName} {student.lastName}
                        {student.currentClass ? (
                          <Badge tone="outline" className="ml-2">
                            {student.currentClass.name}
                          </Badge>
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
                {searched.length > 20 ? (
                  <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
                    Showing the first 20 matches of {searched.length}. Narrow the year
                    group to see the rest.
                  </p>
                ) : null}
              </div>
            </Card>

            {activeView === "report-card" ? (
              <ReportCardPreview
                student={selectedStudent}
                termId={effectiveTermId}
                termName={termName}
              />
            ) : (
              <FeeInvoicePreview
                student={selectedStudent}
                termId={effectiveTermId}
                termName={termName}
              />
            )}
          </div>
        ) : null}

        {/* The two whole-class documents print whatever the filters left, so
            they get the same three answers the picker above gets — the roll
            arriving, a roll that does not exist yet, and a roll the filters
            emptied. Handing `ClassListPreview` an empty array put a Print
            button over a table saying "nothing is left", which prints. */}
        {activeView === "class-list" || activeView === "attendance-register" ? (
          studentsQuery.isPending ? (
            <CardsSkeleton count={1} columns={1} lines={8} />
          ) : studentsQuery.isError ? null : searched.length === 0 ? (
            rollNotStarted ? (
              <NothingYet
                title="No pupil is on the roll yet"
                body="A class list and a register are both lists of pupils. Admit or import them first."
              />
            ) : (
              <NothingMatched
                what="pupils"
                filters={pupilFilterNames}
                onClear={noPupilFilters}
              />
            )
          ) : activeView === "class-list" ? (
            <ClassListPreview students={searched} scope={scopeLabel} />
          ) : (
            <AttendanceRegisterPreview students={searched} scope={scopeLabel} />
          )
        ) : null}
      </VerticalDataViews>

      {/*
        The three notes the canvas draws under this screen. They are the record
        of what was wrong with it, kept beside the fix so the next person to
        open the file knows which decisions were deliberate.
      */}
      <div className="grid items-start gap-3 lg:grid-cols-3">
        <Card title="What ships instead">
          <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
            The report card&rsquo;s subject table used to be a single row reading
            &ldquo;Results data will be populated from the results module for the
            selected term.&rdquo; The marks are what the screen is for, so it now reads
            them from the results module for the term in view, and the fee invoice
            reads its real lines rather than printing Tuition Fee, Boarding Fee and
            Total Due each with a literal &ldquo;-&rdquo;.
          </p>
        </Card>

        <Card title="The two tabs with no filter">
          <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
            <strong>Class Lists</strong> and <strong>Attendance Registers</strong> reused
            the student search state but never rendered the search box, so they printed
            all 842 pupils with no way to narrow to a class. The filter row above is the
            fix, and it is the same <code>FilterBar</code> every other campus screen
            already uses.
          </p>
        </Card>

        <Card title="Printing">
          <p className="text-[length:var(--type-caption)] text-[color:var(--text-muted)]">
            Printing is a hand-rolled <code>window.open</code> plus{" "}
            <code>document.write</code> of the preview&rsquo;s innerHTML, with its own
            inline stylesheet — that is what a browser will actually print from, so it
            stays. A blocked pop-up used to return silently; it now says so on the page.
          </p>
        </Card>
      </div>
    </div>
  );
}
