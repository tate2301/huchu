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

export async function generateCollectionsReport(
  companyId: string,
  options: {
    startDate?: Date;
    endDate?: Date;
    termId?: string;
  } = {},
): Promise<CollectionsReportRow[]> {
  const { startDate, endDate, termId } = options;

  // Build where clause
  const where: Prisma.SchoolFeeInvoiceWhereInput = {
    companyId,
    status: { in: ["ISSUED", "PART_PAID", "PAID"] },
  };

  if (termId) {
    where.termId = termId;
  }
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
  if (termId) {
    receiptWhere.allocations = { some: { invoice: { termId } } };
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

// ============================================================================
// Arrears Aging Report
// ============================================================================

export async function generateArrearsAgingReport(
  companyId: string,
  options: {
    termId?: string;
    classId?: string;
  } = {},
): Promise<ArrearsAgingRow[]> {
  const { termId, classId } = options;
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

  return Array.from(studentMap.values());
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
// Export Functions (CSV/PDF placeholders)
// ============================================================================

export async function exportReportToCSV(
  reportType: "collections" | "arrears" | "enrollment" | "occupancy",
  data: unknown[],
): Promise<string> {
  // Simple CSV generation
  if (data.length === 0) {
    return "";
  }

  const headers = Object.keys(data[0] as object);
  const csvRows = [headers.join(",")];

  for (const row of data) {
    const values = headers.map((header) => {
      const value = (row as Record<string, unknown>)[header];
      if (typeof value === "object" && value !== null) {
        return JSON.stringify(value);
      }
      return String(value ?? "");
    });
    csvRows.push(values.join(","));
  }

  return csvRows.join("\n");
}

export async function exportReportToPDF(
  reportType: string,
  data: unknown[],
  companyName: string,
): Promise<Buffer> {
  // Placeholder for PDF generation
  // In production, use a library like @react-pdf/renderer or puppeteer
  const content = `
    ${companyName}
    ${reportType.toUpperCase()} REPORT
    Generated: ${new Date().toISOString()}

    ${JSON.stringify(data, null, 2)}
  `;

  return Buffer.from(content, "utf-8");
}
