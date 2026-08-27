/**
 * School Reports Library
 * Phase 5: Advanced reporting with collections, arrears, enrollment, and occupancy analytics
 */

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

export type CollectionsReportRow = {
  period: string;
  termId: string;
  termName: string;
  invoiced: number;
  collected: number;
  collectionRate: number;
  receiptsCount: number;
};

export type ArrearsAgingRow = {
  studentId: string;
  studentNo: string;
  studentName: string;
  classId: string;
  className: string;
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
};

export type EnrollmentStatsRow = {
  period: string;
  termId: string;
  termName: string;
  totalEnrolled: number;
  boardingCount: number;
  dayCount: number;
  maleCount: number;
  femaleCount: number;
  classBreakdown: Array<{
    classId: string;
    className: string;
    count: number;
  }>;
};

export type OccupancyReportRow = {
  hostelId: string;
  hostelCode: string;
  hostelName: string;
  totalBeds: number;
  occupiedBeds: number;
  occupancyRate: number;
  activeAllocations: number;
  roomCount: number;
  genderPolicy: string;
};

export type ReportExportFormat = "csv" | "pdf";

// ============================================================================
// Collections Report
// ============================================================================

export type CollectionsReportOptions = {
  startDate?: Date;
  endDate?: Date;
  termId?: string;
  /** Every term in one academic year, when no single term is named. */
  academicYearId?: string;
  /** Only the bills of pupils currently in this year group. */
  classId?: string;
  /** Only the bills raised off one fee structure. */
  feeStructureId?: string;
};

/**
 * The narrowing the filter row asks for, as one invoice predicate.
 *
 * It is built once and used twice — against the invoices, and again inside the
 * receipts query's `allocations.some.invoice` — because a receipt is "in scope"
 * exactly when it settles an invoice that is. Building it in two places is how
 * the term filter used to count receipts the invoice filter had excluded.
 */
function collectionsScope(options: CollectionsReportOptions) {
  const scope: Prisma.SchoolFeeInvoiceWhereInput = {};
  if (options.termId) scope.termId = options.termId;
  if (options.academicYearId) scope.term = { academicYearId: options.academicYearId };
  if (options.classId) scope.student = { currentClassId: options.classId };
  if (options.feeStructureId) scope.feeStructureId = options.feeStructureId;
  return Object.keys(scope).length > 0 ? scope : null;
}

export async function generateCollectionsReport(
  companyId: string,
  options: CollectionsReportOptions = {},
): Promise<CollectionsReportRow[]> {
  const { startDate, endDate } = options;
  const scope = collectionsScope(options);

  // Build where clause
  const where: Prisma.SchoolFeeInvoiceWhereInput = {
    companyId,
    status: { in: ["ISSUED", "PART_PAID", "PAID"] },
    ...(scope ?? {}),
  };

  if (startDate && endDate) {
    where.issueDate = { gte: startDate, lte: endDate };
  } else if (startDate) {
    where.issueDate = { gte: startDate };
  } else if (endDate) {
    where.issueDate = { lte: endDate };
  }

  // Fetch invoices with term information
  const invoices = await prisma.schoolFeeInvoice.findMany({
    where,
    select: {
      id: true,
      termId: true,
      totalAmount: true,
      paidAmount: true,
      issueDate: true,
      term: {
        select: {
          id: true,
          code: true,
          name: true,
          startDate: true,
        },
      },
    },
    orderBy: { issueDate: "asc" },
  });

  // Fetch receipts for the same period
  const receiptWhere: Prisma.SchoolFeeReceiptWhereInput = {
    companyId,
    status: { in: ["POSTED"] },
  };
  if (scope) {
    receiptWhere.allocations = { some: { invoice: scope } };
  }
  if (startDate && endDate) {
    receiptWhere.receiptDate = { gte: startDate, lte: endDate };
  } else if (startDate) {
    receiptWhere.receiptDate = { gte: startDate };
  } else if (endDate) {
    receiptWhere.receiptDate = { lte: endDate };
  }

  const receipts = await prisma.schoolFeeReceipt.findMany({
    where: receiptWhere,
    select: {
      id: true,
      allocations: {
        select: {
          invoice: {
            select: {
              termId: true,
            },
          },
        },
      },
    },
  });

  // Group by term
  const termMap = new Map<string, CollectionsReportRow>();

  for (const invoice of invoices) {
    const termKey = invoice.termId;
    if (!termMap.has(termKey)) {
      termMap.set(termKey, {
        period: invoice.term.startDate?.toISOString().slice(0, 7) ?? "Unknown",
        termId: invoice.term.id,
        termName: invoice.term.name,
        invoiced: 0,
        collected: 0,
        collectionRate: 0,
        receiptsCount: 0,
      });
    }

    const row = termMap.get(termKey)!;
    row.invoiced += Number(invoice.totalAmount);
    row.collected += Number(invoice.paidAmount);
  }

  // Add receipt counts per term
  const receiptCountsByTerm = new Map<string, number>();
  for (const receipt of receipts) {
    for (const alloc of receipt.allocations) {
      const termKey = alloc.invoice.termId;
      receiptCountsByTerm.set(termKey, (receiptCountsByTerm.get(termKey) ?? 0) + 1);
    }
  }

  // Calculate collection rates
  const rows = Array.from(termMap.values());
  for (const row of rows) {
    row.receiptsCount = receiptCountsByTerm.get(row.termId) ?? 0;
    row.collectionRate = row.invoiced > 0 ? (row.collected / row.invoiced) * 100 : 0;
  }

  return rows;
}

export type CollectionsByYearGroupRow = {
  classId: string;
  className: string;
  invoiced: number;
  collected: number;
  collectionRate: number;
};

/**
 * The same collections, cut by year group instead of by term.
 *
 * A separate call rather than a second shape on `generateCollectionsReport`,
 * whose rows the CSV and PDF export renders column by column — widening its
 * return would put a nested breakdown through a table renderer. The office
 * reads the two together: the term row says the school is 27 points down, and
 * this says which four year groups are carrying it.
 */
export async function collectionsByYearGroup(
  companyId: string,
  options: CollectionsReportOptions = {},
): Promise<CollectionsByYearGroupRow[]> {
  const scope = collectionsScope(options);

  const where: Prisma.SchoolFeeInvoiceWhereInput = {
    companyId,
    status: { in: ["ISSUED", "PART_PAID", "PAID"] },
    ...(scope ?? {}),
  };
  if (options.startDate && options.endDate) {
    where.issueDate = { gte: options.startDate, lte: options.endDate };
  } else if (options.startDate) {
    where.issueDate = { gte: options.startDate };
  } else if (options.endDate) {
    where.issueDate = { lte: options.endDate };
  }

  const invoices = await prisma.schoolFeeInvoice.findMany({
    where,
    select: {
      totalAmount: true,
      paidAmount: true,
      student: {
        select: { currentClass: { select: { id: true, name: true, level: true } } },
      },
    },
  });

  const byClass = new Map<
    string,
    CollectionsByYearGroupRow & { level: number | null }
  >();
  for (const invoice of invoices) {
    const schoolClass = invoice.student.currentClass;
    // A bill against a pupil who has left and lost their class placement still
    // has to be somewhere, or the year-group column stops adding up to the term.
    const key = schoolClass?.id ?? "";
    const row =
      byClass.get(key) ??
      ({
        classId: key,
        className: schoolClass?.name ?? "No year group",
        level: schoolClass?.level ?? null,
        invoiced: 0,
        collected: 0,
        collectionRate: 0,
      } satisfies CollectionsByYearGroupRow & { level: number | null });
    row.invoiced += Number(invoice.totalAmount);
    row.collected += Number(invoice.paidAmount);
    byClass.set(key, row);
  }

  // Form 1 before Upper 6, so the panel reads down the school the way the
  // school talks about itself rather than alphabetically.
  const ordered = [...byClass.values()].sort(
    (a, b) =>
      (a.level ?? 99) - (b.level ?? 99) || a.className.localeCompare(b.className),
  );

  return ordered.map((row) => ({
    classId: row.classId,
    className: row.className,
    invoiced: row.invoiced,
    collected: row.collected,
    collectionRate: row.invoiced > 0 ? (row.collected / row.invoiced) * 100 : 0,
  }));
}

// ============================================================================
// Arrears Aging Report
// ============================================================================

/** The oldest bucket a family's debt has reached — the arrears board's age filter. */
export type ArrearsAgeBucket = "days30" | "days60" | "days90" | "days120Plus";

const AGE_ORDER: ArrearsAgeBucket[] = ["days30", "days60", "days90", "days120Plus"];

export type ArrearsAgingOptions = {
  termId?: string;
  classId?: string;
  streamId?: string;
  /** True for boarders only, false for day pupils only, absent for both. */
  isBoarding?: boolean;
  /** Hide the small change: only families owing at least this much. */
  minOutstanding?: number;
  /** "Anything that has reached 60 days or worse" — not "exactly 60". */
  oldestAtLeast?: ArrearsAgeBucket;
};

export async function generateArrearsAgingReport(
  companyId: string,
  options: ArrearsAgingOptions = {},
): Promise<ArrearsAgingRow[]> {
  const { termId, classId, streamId, isBoarding } = options;
  const today = new Date();

  // Build where clause
  const where: Prisma.SchoolFeeInvoiceWhereInput = {
    companyId,
    status: { in: ["ISSUED", "PART_PAID"] },
    balanceAmount: { gt: 0 },
  };

  if (termId) {
    where.termId = termId;
  }
  // Stream and boarding are facts about the pupil rather than the bill, so they
  // narrow the query; the age and the amount are computed from the buckets
  // below and can only be applied once every invoice has been folded in.
  if (streamId || isBoarding !== undefined) {
    where.student = {
      ...(streamId ? { currentStreamId: streamId } : {}),
      ...(isBoarding !== undefined ? { isBoarding } : {}),
    };
  }

  // Fetch outstanding invoices
  const invoices = await prisma.schoolFeeInvoice.findMany({
    where,
    select: {
      id: true,
      studentId: true,
      termId: true,
      dueDate: true,
      balanceAmount: true,
      student: {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
          enrollments: {
            where: {
              ...(termId ? { termId } : {}),
              status: "ACTIVE",
            },
            select: {
              class: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            take: 1,
            orderBy: { createdAt: "desc" },
          },
        },
      },
    },
    orderBy: [{ student: { lastName: "asc" } }, { dueDate: "asc" }],
  });

  // Filter by classId if provided
  const filteredInvoices = classId
    ? invoices.filter((inv) => inv.student.enrollments[0]?.class.id === classId)
    : invoices;

  // Group by student and calculate aging
  const studentMap = new Map<string, ArrearsAgingRow>();

  for (const invoice of filteredInvoices) {
    const studentKey = invoice.studentId;
    const enrollment = invoice.student.enrollments[0];

    if (!studentMap.has(studentKey)) {
      studentMap.set(studentKey, {
        studentId: invoice.student.id,
        studentNo: invoice.student.studentNo,
        studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
        classId: enrollment?.class.id ?? "",
        className: enrollment?.class.name ?? "No Class",
        totalOutstanding: 0,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        days120Plus: 0,
      });
    }

    const row = studentMap.get(studentKey)!;
    const outstanding = Number(invoice.balanceAmount);
    row.totalOutstanding += outstanding;

    // Calculate days overdue
    if (invoice.dueDate) {
      const daysOverdue = Math.floor(
        (today.getTime() - invoice.dueDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysOverdue <= 0) {
        row.current += outstanding;
      } else if (daysOverdue <= 30) {
        row.days30 += outstanding;
      } else if (daysOverdue <= 60) {
        row.days60 += outstanding;
      } else if (daysOverdue <= 90) {
        row.days90 += outstanding;
      } else {
        row.days120Plus += outstanding;
      }
    } else {
      row.current += outstanding;
    }
  }

  let rows = Array.from(studentMap.values());

  if (options.minOutstanding !== undefined && options.minOutstanding > 0) {
    const floor = options.minOutstanding;
    rows = rows.filter((row) => row.totalOutstanding >= floor);
  }

  if (options.oldestAtLeast) {
    // "60 days or worse", not "exactly the 60 bucket": a family whose oldest
    // debt has run to 90 is not less overdue than one sitting at 60, and
    // dropping them off the list is how a chase list loses its worst cases.
    const from = AGE_ORDER.indexOf(options.oldestAtLeast);
    const buckets = AGE_ORDER.slice(from);
    rows = rows.filter((row) => buckets.some((bucket) => row[bucket] > 0));
  }

  // Biggest debt first. The bursar works down this list and stops when the
  // afternoon runs out, so the order decides who actually gets rung.
  return rows.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
}

// ============================================================================
// Enrollment Statistics Report
// ============================================================================

export async function generateEnrollmentStatsReport(
  companyId: string,
  options: {
    termId?: string;
    startDate?: Date;
    endDate?: Date;
  } = {},
): Promise<EnrollmentStatsRow[]> {
  const { termId, startDate, endDate } = options;

  // Build where clause for terms
  const termWhere: Prisma.SchoolTermWhereInput = {
    companyId,
  };

  if (termId) {
    termWhere.id = termId;
  }
  if (startDate && endDate) {
    termWhere.startDate = { gte: startDate, lte: endDate };
  } else if (startDate) {
    termWhere.startDate = { gte: startDate };
  } else if (endDate) {
    termWhere.startDate = { lte: endDate };
  }

  // Fetch terms
  const terms = await prisma.schoolTerm.findMany({
    where: termWhere,
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      enrollments: {
        where: {
          status: "ACTIVE",
        },
        select: {
          id: true,
          studentId: true,
          classId: true,
          student: {
            select: {
              id: true,
              gender: true,
              isBoarding: true,
            },
          },
          class: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
    orderBy: { startDate: "asc" },
  });

  // Generate stats per term
  const rows: EnrollmentStatsRow[] = [];

  for (const term of terms) {
    const enrollments = term.enrollments;
    const uniqueStudents = new Set(enrollments.map((e) => e.studentId));

    let boardingCount = 0;
    let maleCount = 0;
    let femaleCount = 0;

    const classCountMap = new Map<string, { classId: string; className: string; count: number }>();

    for (const enrollment of enrollments) {
      if (enrollment.student.isBoarding) {
        boardingCount++;
      }
      if (enrollment.student.gender === "M") {
        maleCount++;
      } else if (enrollment.student.gender === "F") {
        femaleCount++;
      }

      const classKey = enrollment.classId;
      if (!classCountMap.has(classKey)) {
        classCountMap.set(classKey, {
          classId: enrollment.class.id,
          className: enrollment.class.name,
          count: 0,
        });
      }
      classCountMap.get(classKey)!.count++;
    }

    const totalEnrolled = uniqueStudents.size;
    const dayCount = totalEnrolled - boardingCount;

    rows.push({
      period: term.startDate?.toISOString().slice(0, 7) ?? "Unknown",
      termId: term.id,
      termName: term.name,
      totalEnrolled,
      boardingCount,
      dayCount,
      maleCount,
      femaleCount,
      classBreakdown: Array.from(classCountMap.values()),
    });
  }

  return rows;
}

// ============================================================================
// Occupancy Report
// ============================================================================

export async function generateOccupancyReport(companyId: string): Promise<OccupancyReportRow[]> {
  // Fetch hostels with bed and allocation counts
  const hostels = await prisma.schoolHostel.findMany({
    where: {
      companyId,
      isActive: true,
    },
    select: {
      id: true,
      code: true,
      name: true,
      genderPolicy: true,
      _count: {
        select: {
          rooms: true,
          beds: true,
          allocations: {
            where: {
              status: "ACTIVE",
            },
          },
        },
      },
      beds: {
        where: {
          isActive: true,
        },
        select: {
          id: true,
          status: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });

  const rows: OccupancyReportRow[] = [];

  for (const hostel of hostels) {
    const totalBeds = hostel.beds.length;
    const occupiedBeds = hostel.beds.filter((b) => b.status === "OCCUPIED").length;
    const occupancyRate = totalBeds > 0 ? (occupiedBeds / totalBeds) * 100 : 0;

    rows.push({
      hostelId: hostel.id,
      hostelCode: hostel.code,
      hostelName: hostel.name,
      totalBeds,
      occupiedBeds,
      occupancyRate,
      activeAllocations: hostel._count.allocations,
      roomCount: hostel._count.rooms,
      genderPolicy: hostel.genderPolicy,
    });
  }

  return rows;
}

// ============================================================================
// Exports
// ============================================================================
//
// S-5.4 removed `exportReportToCSV` and `exportReportToPDF` from this file.
// The first joined values with commas and no quoting — one comma in a hostel's
// name and every column after it moved — and the second returned
// `Buffer.from(JSON.stringify(data))` under an `application/pdf` header, so a
// head who pressed Export got a file their reader refused to open.
//
// A report export now goes through `lib/documents/`, the same pipeline the
// invoices and report cards use: the tenant's letterhead, a template the school
// can edit, a real PDF renderer and a CSV renderer that quotes. See
// `app/api/v2/schools/reports/export/route.ts`, which declares the columns rather
// than deriving them from the first row's keys.
