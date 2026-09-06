import { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import type { UniversalDocumentPayload } from "@/lib/documents/types";
import type { SchoolResource } from "@/lib/schools/permissions";

/**
 * The school's printable documents.
 *
 * Iteration 5. A school runs on paper it hands to people: a bill a parent takes
 * to the bank, a receipt they keep, a statement they query, a report card a child
 * carries home, a letter that gets a pupil into the next school. Until now the
 * module could show all of that on a screen and print none of it, and
 * `lib/schools/reports.ts` carried an `exportReportToPDF` that returned a text
 * blob of `JSON.stringify(data)` — which is not a document, it is a promise that
 * one exists.
 *
 * These are resolvers for the shared document pipeline
 * (`lib/documents/source-registry.ts`), not a second one. That pipeline already
 * owns the branded template, the tenant's letterhead, the PDF renderer and the
 * template editor a school can change the wording in; a school-specific renderer
 * would be a second layout to keep in step with the first and a second place for
 * a logo to go missing.
 *
 * **Money never passes through a JS number here.** Every amount arrives as
 * `Prisma.Decimal` and is turned into a string with `toFixed(2)`, which is exact.
 * `Number(decimal).toLocaleString()` is how a 450.00 becomes 449.99999999999994 on
 * somebody's invoice, and this file is the last place that would be noticed.
 */

type Resolution = {
  targetType: "LIST" | "RECORD" | "DASHBOARD";
  documentType:
    | "REPORT_TABLE"
    | "DASHBOARD_PACK"
    | "SALES_INVOICE"
    | "SALES_QUOTATION"
    | "SALES_RECEIPT"
    | "GENERIC_RECORD";
  sourceKey: string;
  fileName: string;
  payload: UniversalDocumentPayload;
  rowsForCsv?: Array<Record<string, unknown>>;
};

/** Every school document the pipeline can render. */
export const SCHOOL_DOCUMENT_SOURCE_KEYS = [
  "schools.fee.invoice",
  "schools.fee.receipt",
  "schools.fee.statement",
  "schools.report-card",
  "schools.admission-letter",
  "schools.transfer-letter",
  "schools.class-list",
  "schools.attendance-register",
] as const;

export type SchoolDocumentSourceKey = (typeof SCHOOL_DOCUMENT_SOURCE_KEYS)[number];

export function isSchoolDocumentSourceKey(key: string): key is SchoolDocumentSourceKey {
  return (SCHOOL_DOCUMENT_SOURCE_KEYS as readonly string[]).includes(key);
}

/**
 * What a caller needs to be allowed to render each of these.
 *
 * Two axes, the same pair every school route uses: the FEATURE says the tenant
 * bought the module, and the RESOURCE is what the caller's role is checked
 * against. A school document is a pupil's data — a class list is every child's
 * guardian and phone number on one page — so "signed in on a schools tenant" is
 * not the bar.
 *
 * Kept beside the resolvers rather than in the render route: a new document added
 * here without an entry is a compile error there, which is the point.
 */
export const SCHOOL_DOCUMENT_ACCESS: Record<
  SchoolDocumentSourceKey,
  { feature: string; resource: SchoolResource }
> = {
  "schools.fee.invoice": { feature: "schools.fees", resource: "schools.fees" },
  "schools.fee.receipt": { feature: "schools.fees", resource: "schools.fees" },
  "schools.fee.statement": { feature: "schools.fees", resource: "schools.fees" },
  "schools.report-card": { feature: "schools.results", resource: "schools.results" },
  "schools.admission-letter": {
    feature: "schools.admissions",
    resource: "schools.admissions",
  },
  "schools.transfer-letter": { feature: "schools.students", resource: "schools.students" },
  "schools.class-list": { feature: "schools.students", resource: "schools.students" },
  "schools.attendance-register": {
    feature: "schools.attendance",
    resource: "schools.attendance",
  },
};

const ZERO = new Prisma.Decimal(0);

/** Exact to the cent. See the note above about `Number(decimal)`. */
function money(value: Prisma.Decimal | null | undefined): string {
  return (value ?? ZERO).toFixed(2);
}

function day(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9-]/gi, "-").replace(/-+/g, "-").toLowerCase();
}

/**
 * A fee invoice, as the bill a family is handed.
 *
 * Lines are the invoice's own lines rather than the fee structure's: a bill that
 * has been waived, part-paid or hand-adjusted is what the family owes, and
 * printing the structure would print the school's intention instead of the debt.
 */
async function resolveFeeInvoice(companyId: string, recordId: string): Promise<Resolution> {
  const invoice = await prisma.schoolFeeInvoice.findFirst({
    where: { id: recordId, companyId },
    include: {
      lines: { orderBy: { feeCode: "asc" } },
      student: {
        select: {
          firstName: true,
          lastName: true,
          studentNo: true,
          currentClass: { select: { name: true } },
          guardianLinks: {
            take: 1,
            orderBy: { isPrimary: "desc" },
            select: {
              relationship: true,
              guardian: {
                select: { firstName: true, lastName: true, phone: true, address: true },
              },
            },
          },
        },
      },
      term: { select: { name: true, code: true } },
    },
  });
  if (!invoice) throw new Error("Fee invoice not found");

  const guardianLink = invoice.student.guardianLinks[0];
  const guardian = guardianLink?.guardian;

  return {
    targetType: "RECORD",
    documentType: "SALES_INVOICE",
    sourceKey: "schools.fee.invoice",
    fileName: `fee-invoice-${slug(invoice.invoiceNo)}.pdf`,
    payload: {
      title: "Fee invoice",
      subtitle: invoice.invoiceNo,
      badge: {
        label: invoice.status.replace(/_/g, " ").toLowerCase(),
        tone:
          invoice.status === "PAID"
            ? "positive"
            : invoice.status === "VOIDED" || invoice.status === "WRITEOFF"
              ? "neutral"
              : "warning",
      },
      meta: [
        { label: "Invoice No.", value: invoice.invoiceNo },
        { label: "Pupil", value: fullName(invoice.student) },
        { label: "Student number", value: invoice.student.studentNo },
        ...(invoice.student.currentClass
          ? [{ label: "Class", value: invoice.student.currentClass.name }]
          : []),
        { label: "Term", value: invoice.term.name },
        { label: "Issued", value: day(invoice.issueDate) },
        { label: "Due", value: day(invoice.dueDate) },
      ],
      // Addressed to the family, not to the child: a seven-year-old is not the
      // debtor, and a bill with a pupil's name in the "bill to" block is one a
      // parent has to work out is theirs.
      parties: guardian
        ? [
            {
              title: "Bill to",
              lines: [
                fullName(guardian),
                guardianLink?.relationship
                  ? `${guardianLink.relationship.toLowerCase()} of ${fullName(invoice.student)}`
                  : null,
                guardian.address,
                guardian.phone,
              ].filter((line): line is string => Boolean(line)),
            },
          ]
        : [],
      record: {
        sections: [],
        lines: invoice.lines.map((line) => ({
          feeCode: line.feeCode,
          description: line.description,
          quantity: line.quantity.toFixed(2),
          unitAmount: money(line.unitAmount),
          amount: money(line.lineTotal),
        })),
        lineColumns: [
          { key: "feeCode", label: "Code" },
          { key: "description", label: "Description" },
          { key: "quantity", label: "Qty" },
          { key: "unitAmount", label: "Unit" },
          { key: "amount", label: "Amount" },
        ],
      },
      totals: [
        { label: "Subtotal", value: `${invoice.currency} ${money(invoice.subTotal)}` },
        ...(invoice.taxTotal.isZero()
          ? []
          : [{ label: "Tax", value: `${invoice.currency} ${money(invoice.taxTotal)}` }]),
        ...(invoice.waivedAmount.isZero()
          ? []
          : [{ label: "Waived", value: `${invoice.currency} ${money(invoice.waivedAmount)}` }]),
        { label: "Total", value: `${invoice.currency} ${money(invoice.totalAmount)}` },
        { label: "Paid", value: `${invoice.currency} ${money(invoice.paidAmount)}` },
        {
          label: "Balance due",
          value: `${invoice.currency} ${money(invoice.balanceAmount)}`,
          emphasis: true,
        },
      ],
      notes: invoice.notes ? [invoice.notes] : [],
    },
    rowsForCsv: invoice.lines.map((line) => ({
      invoiceNo: invoice.invoiceNo,
      feeCode: line.feeCode,
      description: line.description,
      amount: money(line.lineTotal),
      currency: invoice.currency,
    })),
  };
}

/** A receipt, as the proof of payment a parent keeps. */
async function resolveFeeReceipt(companyId: string, recordId: string): Promise<Resolution> {
  const receipt = await prisma.schoolFeeReceipt.findFirst({
    where: { id: recordId, companyId },
    include: {
      student: {
        select: {
          firstName: true,
          lastName: true,
          studentNo: true,
          guardianLinks: {
            orderBy: { isPrimary: "desc" },
            take: 1,
            select: {
              relationship: true,
              guardian: { select: { firstName: true, lastName: true, phone: true } },
            },
          },
        },
      },
      allocations: {
        include: { invoice: { select: { invoiceNo: true, term: { select: { name: true } } } } },
      },
    },
  });
  if (!receipt) throw new Error("Fee receipt not found");

  const receiptGuardianLink = receipt.student.guardianLinks[0];
  const receiptGuardian = receiptGuardianLink?.guardian;

  return {
    targetType: "RECORD",
    documentType: "SALES_RECEIPT",
    sourceKey: "schools.fee.receipt",
    fileName: `fee-receipt-${slug(receipt.receiptNo)}.pdf`,
    payload: {
      title: "Fee receipt",
      subtitle: receipt.receiptNo,
      badge: {
        label: receipt.status === "POSTED" ? "Payment received" : receipt.status.toLowerCase(),
        tone: receipt.status === "POSTED" ? "positive" : "neutral",
      },
      meta: [
        { label: "Receipt No.", value: receipt.receiptNo },
        { label: "Pupil", value: fullName(receipt.student) },
        { label: "Student number", value: receipt.student.studentNo },
        { label: "Received", value: day(receipt.receiptDate) },
        { label: "Method", value: receipt.paymentMethod.replace(/_/g, " ").toLowerCase() },
        ...(receipt.reference ? [{ label: "Reference", value: receipt.reference }] : []),
      ],
      // A receipt acknowledges rather than bills, so the block names who paid.
      parties: receiptGuardian
        ? [
            {
              title: "Received from",
              lines: [
                fullName(receiptGuardian),
                receiptGuardianLink?.relationship
                  ? `${receiptGuardianLink.relationship.toLowerCase()} of ${fullName(receipt.student)}`
                  : null,
                receiptGuardian.phone,
              ].filter((line): line is string => Boolean(line)),
            },
          ]
        : [],
      record: {
        sections: [],
        // What the money was put against, invoice by invoice. A receipt showing
        // one total is the thing a parent brings back to the office to ask what
        // it was for.
        lines: receipt.allocations.map((allocation) => ({
          invoice: allocation.invoice?.invoiceNo ?? "On account",
          term: allocation.invoice?.term?.name ?? "—",
          amount: money(allocation.allocatedAmount),
        })),
        lineColumns: [
          { key: "invoice", label: "Invoice" },
          { key: "term", label: "Term" },
          { key: "amount", label: "Amount" },
        ],
      },
      totals: [
        {
          label: "Amount received",
          value: `${receipt.currency} ${money(receipt.amountReceived)}`,
          emphasis: true,
        },
        ...(receipt.amountUnallocated.isZero()
          ? []
          : [
              {
                label: "Held on account",
                value: `${receipt.currency} ${money(receipt.amountUnallocated)}`,
              },
            ]),
      ],
      notes: receipt.notes ? [receipt.notes] : [],
    },
    rowsForCsv: receipt.allocations.map((allocation) => ({
      receiptNo: receipt.receiptNo,
      invoiceNo: allocation.invoice?.invoiceNo ?? "",
      amount: money(allocation.allocatedAmount),
      currency: receipt.currency,
    })),
  };
}

/**
 * A statement: every bill and every payment for one pupil, in order, with what is
 * left.
 *
 * Ordered by date and rendered as a running list rather than two tables, because
 * the question a statement answers is "how did we get to this balance" and that
 * is a sequence. The closing balance is summed from the invoices' own balances
 * rather than by adding charges and subtracting payments — the invoice is where a
 * waiver, a write-off and an allocation have already been reckoned with, and
 * re-deriving it here would be a second opinion about what a family owes.
 */
async function resolveFeeStatement(
  companyId: string,
  studentId: string,
  filters: Record<string, string> | undefined,
): Promise<Resolution> {
  const termId = filters?.termId;

  const student = await prisma.schoolStudent.findFirst({
    where: { id: studentId, companyId },
    select: {
      firstName: true,
      lastName: true,
      studentNo: true,
      currentClass: { select: { name: true } },
      guardianLinks: {
        take: 1,
        orderBy: { isPrimary: "desc" },
        select: { guardian: { select: { firstName: true, lastName: true, phone: true } } },
      },
    },
  });
  if (!student) throw new Error("Student not found");

  const [invoices, receipts] = await Promise.all([
    prisma.schoolFeeInvoice.findMany({
      where: {
        companyId,
        studentId,
        ...(termId ? { termId } : {}),
        status: { not: "VOIDED" },
      },
      orderBy: { issueDate: "asc" },
      select: {
        invoiceNo: true,
        issueDate: true,
        currency: true,
        totalAmount: true,
        balanceAmount: true,
        status: true,
        term: { select: { name: true } },
      },
    }),
    prisma.schoolFeeReceipt.findMany({
      where: {
        companyId,
        studentId,
        status: "POSTED",
        ...(termId ? { allocations: { some: { invoice: { termId } } } } : {}),
      },
      orderBy: { receiptDate: "asc" },
      select: {
        receiptNo: true,
        receiptDate: true,
        currency: true,
        amountReceived: true,
        paymentMethod: true,
      },
    }),
  ]);

  const currency = invoices[0]?.currency ?? receipts[0]?.currency ?? "USD";
  const outstanding = invoices
    .filter((invoice) => invoice.status === "ISSUED" || invoice.status === "PART_PAID")
    .reduce((sum, invoice) => sum.plus(invoice.balanceAmount), ZERO);

  const rows = [
    ...invoices.map((invoice) => ({
      date: day(invoice.issueDate),
      reference: invoice.invoiceNo,
      detail: `${invoice.term.name} fees`,
      charge: money(invoice.totalAmount),
      payment: "",
    })),
    ...receipts.map((receipt) => ({
      date: day(receipt.receiptDate),
      reference: receipt.receiptNo,
      detail: `Payment — ${receipt.paymentMethod.replace(/_/g, " ").toLowerCase()}`,
      charge: "",
      payment: money(receipt.amountReceived),
    })),
  ].sort((left, right) => left.date.localeCompare(right.date));

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "schools.fee.statement",
    fileName: `statement-${slug(student.studentNo)}.pdf`,
    payload: {
      title: "Fee statement",
      subtitle: fullName(student),
      meta: [
        { label: "Pupil", value: fullName(student) },
        { label: "Student number", value: student.studentNo },
        ...(student.currentClass
          ? [{ label: "Class", value: student.currentClass.name }]
          : []),
        ...(termId && invoices[0] ? [{ label: "Term", value: invoices[0].term.name }] : []),
        { label: "Statement date", value: day(new Date()) },
      ],
      record: {
        sections: [],
        lines: rows,
        lineColumns: [
          { key: "date", label: "Date" },
          { key: "reference", label: "Reference" },
          { key: "detail", label: "Detail" },
          { key: "charge", label: "Charged" },
          { key: "payment", label: "Paid" },
        ],
      },
      totals: [
        {
          label: "Balance outstanding",
          value: `${currency} ${outstanding.toFixed(2)}`,
          emphasis: true,
        },
      ],
      notes:
        rows.length === 0
          ? ["Nothing has been billed to this pupil yet."]
          : [],
    },
    rowsForCsv: rows,
  };
}

/**
 * A report card.
 *
 * **Gated on the publish window**, which is the point. S-1.3 lets a school decide
 * when marks may be seen; a printable report card that ignored that would be the
 * hole in the wall beside the locked door — a teacher could hand a parent a PDF of
 * moderated-but-unpublished marks, and the school's own rule about when results
 * are released would mean nothing.
 *
 * The gate is the sheet's PUBLISHED status *and* an open window for that term and
 * class. Both, because a sheet can be published before the window opens (that is
 * what scheduling a window is for) and a window can be open for a class whose
 * sheet is still with the head of department.
 */
async function resolveReportCard(
  companyId: string,
  studentId: string,
  filters: Record<string, string> | undefined,
  now = new Date(),
): Promise<Resolution> {
  const termId = filters?.termId;
  if (!termId) throw new Error("termId is required for a report card");

  const student = await prisma.schoolStudent.findFirst({
    where: { id: studentId, companyId },
    select: {
      firstName: true,
      lastName: true,
      studentNo: true,
      currentClassId: true,
      currentStreamId: true,
      currentClass: { select: { name: true } },
      currentStream: { select: { name: true } },
    },
  });
  if (!student) throw new Error("Student not found");

  const term = await prisma.schoolTerm.findFirst({
    where: { id: termId, companyId },
    select: { name: true, code: true, endDate: true },
  });
  if (!term) throw new Error("Term not found");

  const window = await prisma.schoolPublishWindow.findFirst({
    where: {
      companyId,
      termId,
      status: "OPEN",
      openAt: { lte: now },
      closeAt: { gte: now },
      // A window may be for the whole school (null class) or for one class.
      OR: [
        { classId: null },
        ...(student.currentClassId ? [{ classId: student.currentClassId }] : []),
      ],
    },
    select: { id: true, closeAt: true },
  });
  if (!window) {
    throw new Error(
      "Results for this term are not published. A report card can only be printed while the publish window is open.",
    );
  }

  const lines = await prisma.schoolResultLine.findMany({
    where: {
      companyId,
      studentId,
      sheet: { termId, status: "PUBLISHED" },
    },
    orderBy: { subjectCode: "asc" },
    select: {
      subjectCode: true,
      score: true,
      grade: true,
      remarks: true,
      sheet: { select: { title: true, publishedAt: true } },
    },
  });
  if (lines.length === 0) {
    throw new Error("No published marks for this pupil in this term.");
  }

  const subjects = await prisma.schoolSubject.findMany({
    where: { companyId, code: { in: lines.map((line) => line.subjectCode) } },
    select: { code: true, name: true, passMark: true },
  });
  const subjectByCode = new Map(subjects.map((subject) => [subject.code, subject]));

  const rows = lines.map((line) => {
    const subject = subjectByCode.get(line.subjectCode);
    return {
      subject: subject?.name ?? line.subjectCode,
      code: line.subjectCode,
      score: line.score.toFixed(1),
      grade: line.grade ?? "—",
      // S-1.3's pass mark, per subject, because 40 and 50 are both normal here
      // and a report card that says "pass" against a school-wide number is
      // saying something the school did not.
      outcome:
        subject?.passMark == null
          ? "—"
          : line.score >= subject.passMark
            ? "Pass"
            : "Below pass",
      remarks: line.remarks ?? "",
    };
  });

  const average = rows.length
    ? (lines.reduce((sum, line) => sum + line.score, 0) / lines.length).toFixed(1)
    : "—";

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "schools.report-card",
    fileName: `report-card-${slug(student.studentNo)}-${slug(term.code)}.pdf`,
    payload: {
      title: "Report card",
      subtitle: `${fullName(student)} — ${term.name}`,
      meta: [
        { label: "Pupil", value: fullName(student) },
        { label: "Student number", value: student.studentNo },
        ...(student.currentClass
          ? [{ label: "Class", value: student.currentClass.name }]
          : []),
        ...(student.currentStream
          ? [{ label: "Stream", value: student.currentStream.name }]
          : []),
        { label: "Term", value: term.name },
        { label: "Subjects", value: String(rows.length) },
        { label: "Average", value: average },
      ],
      record: {
        sections: [],
        lines: rows,
        lineColumns: [
          { key: "subject", label: "Subject" },
          { key: "score", label: "Mark" },
          { key: "grade", label: "Grade" },
          { key: "outcome", label: "Outcome" },
          { key: "remarks", label: "Remarks" },
        ],
      },
      notes: [
        `Published marks only. This card was printed on ${day(now)} while the school's results window was open.`,
      ],
    },
    rowsForCsv: rows,
  };
}

/** The letter that tells a family their child has a place. */
async function resolveAdmissionLetter(
  companyId: string,
  applicationId: string,
): Promise<Resolution> {
  const application = await prisma.schoolApplication.findFirst({
    where: { id: applicationId, companyId },
    include: {
      appliedForClass: { select: { name: true } },
      intendedTerm: { select: { name: true } },
      student: { select: { studentNo: true } },
    },
  });
  if (!application) throw new Error("Application not found");

  const name = `${application.firstName} ${application.lastName}`.trim();

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "schools.admission-letter",
    fileName: `admission-${slug(application.applicationNo)}.pdf`,
    payload: {
      title: "Offer of a place",
      subtitle: name,
      badge: {
        label: application.stage.replace(/_/g, " ").toLowerCase(),
        tone: application.stage === "ACCEPTED" ? "positive" : "warning",
      },
      meta: [
        { label: "Application No.", value: application.applicationNo },
        { label: "Pupil", value: name },
        ...(application.student?.studentNo
          ? [{ label: "Student number", value: application.student.studentNo }]
          : []),
        ...(application.appliedForClass ? [{ label: "Class", value: application.appliedForClass.name }] : []),
        ...(application.intendedTerm ? [{ label: "Starting", value: application.intendedTerm.name }] : []),
        { label: "Decision date", value: day(application.offeredAt ?? application.updatedAt) },
      ],
      parties: [
        {
          title: "To",
          lines: [
            application.guardianName ?? "The parent or guardian",
            application.guardianPhone,
            application.guardianEmail,
          ].filter((line): line is string => Boolean(line)),
        },
      ],
      record: { sections: [] },
      notes: [
        application.stage === "ACCEPTED"
          ? `We are pleased to offer ${name} a place${application.appliedForClass ? ` in ${application.appliedForClass.name}` : ""}${application.intendedTerm ? ` from ${application.intendedTerm.name}` : ""}.`
          : `This letter records the current status of ${name}'s application: ${application.stage.replace(/_/g, " ").toLowerCase()}.`,
        ...(application.notes ? [application.notes] : []),
      ],
    },
  };
}

/**
 * The letter a pupil takes to their next school.
 *
 * It states what the next school actually asks for — that the child was here,
 * which class they reached, and **whether the family owes anything**, because a
 * transfer letter issued over an unpaid balance is a decision a school makes
 * deliberately, not one a document should hide.
 */
async function resolveTransferLetter(companyId: string, studentId: string): Promise<Resolution> {
  const student = await prisma.schoolStudent.findFirst({
    where: { id: studentId, companyId },
    select: {
      firstName: true,
      lastName: true,
      studentNo: true,
      dateOfBirth: true,
      admissionDate: true,
      status: true,
      currentClass: { select: { name: true } },
      enrollments: {
        orderBy: { enrolledAt: "desc" },
        take: 1,
        select: {
          term: { select: { name: true } },
          class: { select: { name: true } },
        },
      },
    },
  });
  if (!student) throw new Error("Student not found");

  const owing = await prisma.schoolFeeInvoice.findMany({
    where: { companyId, studentId, status: { in: ["ISSUED", "PART_PAID"] } },
    select: { currency: true, balanceAmount: true },
  });
  const currency = owing[0]?.currency ?? "USD";
  const balance = owing.reduce((sum, invoice) => sum.plus(invoice.balanceAmount), ZERO);

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "schools.transfer-letter",
    fileName: `transfer-${slug(student.studentNo)}.pdf`,
    payload: {
      title: "Transfer letter",
      subtitle: fullName(student),
      meta: [
        { label: "Pupil", value: fullName(student) },
        { label: "Student number", value: student.studentNo },
        ...(student.dateOfBirth ? [{ label: "Date of birth", value: day(student.dateOfBirth) }] : []),
        ...(student.admissionDate ? [{ label: "Admitted", value: day(student.admissionDate) }] : []),
        {
          label: "Last class",
          value:
            student.enrollments[0]?.class?.name ?? student.currentClass?.name ?? "—",
        },
        ...(student.enrollments[0]?.term
          ? [{ label: "Last term", value: student.enrollments[0].term.name }]
          : []),
        { label: "Status", value: student.status.toLowerCase() },
      ],
      record: { sections: [] },
      totals: [
        {
          label: "Fees outstanding",
          value: `${currency} ${balance.toFixed(2)}`,
          emphasis: !balance.isZero(),
        },
      ],
      notes: [
        `This letter confirms that ${fullName(student)} was a pupil at this school.`,
        !balance.isZero()
          ? "There is an outstanding fee balance on this pupil's account, shown above."
          : "There is no outstanding fee balance on this pupil's account.",
      ],
    },
  };
}

/** A class list — the register's paper cousin, and what a school prints most. */
async function resolveClassList(
  companyId: string,
  filters: Record<string, string> | undefined,
): Promise<Resolution> {
  const classId = filters?.classId;
  if (!classId) throw new Error("classId is required for a class list");

  const [schoolClass, students] = await Promise.all([
    prisma.schoolClass.findFirst({
      where: { id: classId, companyId },
      select: { name: true, code: true, term: { select: { name: true } } },
    }),
    prisma.schoolStudent.findMany({
      where: { companyId, currentClassId: classId, status: { in: ["ACTIVE", "SUSPENDED"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: {
        studentNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        isBoarding: true,
        currentStream: { select: { name: true } },
        guardianLinks: {
          take: 1,
          orderBy: { isPrimary: "desc" },
          select: { guardian: { select: { firstName: true, lastName: true, phone: true } } },
        },
      },
    }),
  ]);
  if (!schoolClass) throw new Error("Class not found");

  const rows = students.map((student, index) => ({
    no: String(index + 1),
    studentNo: student.studentNo,
    name: `${student.lastName}, ${student.firstName}`,
    stream: student.currentStream?.name ?? "—",
    gender: student.gender ?? "—",
    boarding: student.isBoarding ? "Boarder" : "Day",
    guardian: student.guardianLinks[0]?.guardian
      ? fullName(student.guardianLinks[0].guardian)
      : "—",
    phone: student.guardianLinks[0]?.guardian?.phone ?? "—",
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "schools.class-list",
    fileName: `class-list-${slug(schoolClass.code)}.pdf`,
    payload: {
      title: `${schoolClass.name} class list`,
      subtitle: schoolClass.term?.name ?? undefined,
      meta: [
        { label: "Class", value: schoolClass.name },
        { label: "On the roll", value: String(rows.length) },
        { label: "Printed", value: day(new Date()) },
      ],
      list: {
        columns: [
          { key: "no", label: "#" },
          { key: "studentNo", label: "Student no." },
          { key: "name", label: "Name" },
          { key: "stream", label: "Stream" },
          { key: "gender", label: "Sex" },
          { key: "boarding", label: "Boarding" },
          { key: "guardian", label: "Guardian" },
          { key: "phone", label: "Phone" },
        ],
        rows,
      },
    },
    rowsForCsv: rows,
  };
}

/**
 * A blank attendance register, for the days the line is down.
 *
 * Deliberately blank rather than a print of what was recorded: a school prints
 * this to take a register on paper, and the columns are the school days of the
 * week so a teacher can tick them. `S-8.1` will make the offline register work
 * properly; until then this is what a school actually falls back on, and printing
 * an empty grid is more use than printing last week's ticks.
 */
async function resolveAttendanceRegister(
  companyId: string,
  filters: Record<string, string> | undefined,
): Promise<Resolution> {
  const classId = filters?.classId;
  if (!classId) throw new Error("classId is required for an attendance register");

  const [schoolClass, students] = await Promise.all([
    prisma.schoolClass.findFirst({
      where: { id: classId, companyId },
      select: { name: true, code: true, term: { select: { name: true } } },
    }),
    prisma.schoolStudent.findMany({
      where: { companyId, currentClassId: classId, status: { in: ["ACTIVE", "SUSPENDED"] } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { studentNo: true, firstName: true, lastName: true },
    }),
  ]);
  if (!schoolClass) throw new Error("Class not found");

  const rows = students.map((student, index) => ({
    no: String(index + 1),
    studentNo: student.studentNo,
    name: `${student.lastName}, ${student.firstName}`,
    mon: "",
    tue: "",
    wed: "",
    thu: "",
    fri: "",
  }));

  return {
    targetType: "LIST",
    documentType: "REPORT_TABLE",
    sourceKey: "schools.attendance-register",
    fileName: `register-${slug(schoolClass.code)}.pdf`,
    payload: {
      title: `${schoolClass.name} attendance register`,
      subtitle: schoolClass.term?.name ?? undefined,
      meta: [
        { label: "Class", value: schoolClass.name },
        { label: "Pupils", value: String(rows.length) },
        { label: "Week beginning", value: filters?.weekOf ?? "—" },
      ],
      list: {
        columns: [
          { key: "no", label: "#" },
          { key: "studentNo", label: "Student no." },
          { key: "name", label: "Name" },
          { key: "mon", label: "Mon" },
          { key: "tue", label: "Tue" },
          { key: "wed", label: "Wed" },
          { key: "thu", label: "Thu" },
          { key: "fri", label: "Fri" },
        ],
        rows,
      },
    },
    rowsForCsv: rows,
  };
}

export async function resolveSchoolDocument(
  companyId: string,
  input: {
    sourceKey: SchoolDocumentSourceKey;
    recordId?: string;
    filters?: Record<string, string>;
  },
): Promise<Resolution> {
  switch (input.sourceKey) {
    case "schools.fee.invoice":
      if (!input.recordId) throw new Error("recordId is required for a fee invoice");
      return resolveFeeInvoice(companyId, input.recordId);
    case "schools.fee.receipt":
      if (!input.recordId) throw new Error("recordId is required for a fee receipt");
      return resolveFeeReceipt(companyId, input.recordId);
    case "schools.fee.statement":
      if (!input.recordId) throw new Error("recordId is required for a statement");
      return resolveFeeStatement(companyId, input.recordId, input.filters);
    case "schools.report-card":
      if (!input.recordId) throw new Error("recordId is required for a report card");
      return resolveReportCard(companyId, input.recordId, input.filters);
    case "schools.admission-letter":
      if (!input.recordId) throw new Error("recordId is required for an admission letter");
      return resolveAdmissionLetter(companyId, input.recordId);
    case "schools.transfer-letter":
      if (!input.recordId) throw new Error("recordId is required for a transfer letter");
      return resolveTransferLetter(companyId, input.recordId);
    case "schools.class-list":
      return resolveClassList(companyId, input.filters);
    case "schools.attendance-register":
      return resolveAttendanceRegister(companyId, input.filters);
  }
}
