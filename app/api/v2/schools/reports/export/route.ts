import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, validateSession } from "@/lib/api-utils";
import {
  generateCollectionsReport,
  generateArrearsAgingReport,
  generateEnrollmentStatsReport,
  generateOccupancyReport,
  exportReportToCSV,
  exportReportToPDF,
} from "@/lib/schools/reports";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  reportType: z.enum(["collections", "arrears", "enrollment", "occupancy"]),
  format: z.enum(["csv", "pdf"]),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      reportType: searchParams.get("reportType") ?? undefined,
      format: searchParams.get("format") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
    });

    // Generate report data
    let reportData: unknown[] = [];

    switch (query.reportType) {
      case "collections": {
        const options: Parameters<typeof generateCollectionsReport>[1] = {};
        if (query.startDate) options.startDate = new Date(query.startDate);
        if (query.endDate) options.endDate = new Date(query.endDate);
        if (query.termId) options.termId = query.termId;
        reportData = await generateCollectionsReport(session.user.companyId, options);
        break;
      }
      case "arrears": {
        reportData = await generateArrearsAgingReport(session.user.companyId, {
          termId: query.termId,
          classId: query.classId,
        });
        break;
      }
      case "enrollment": {
        const options: Parameters<typeof generateEnrollmentStatsReport>[1] = {};
        if (query.termId) options.termId = query.termId;
        if (query.startDate) options.startDate = new Date(query.startDate);
        if (query.endDate) options.endDate = new Date(query.endDate);
        reportData = await generateEnrollmentStatsReport(session.user.companyId, options);
        break;
      }
      case "occupancy": {
        reportData = await generateOccupancyReport(session.user.companyId);
        break;
      }
    }

    // Export to requested format
    if (query.format === "csv") {
      const csv = await exportReportToCSV(query.reportType, reportData);
      const filename = `${query.reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } else {
      // PDF export
      const company = await prisma.company.findUnique({
        where: { id: session.user.companyId },
        select: { name: true },
      });

      const pdf = await exportReportToPDF(
        query.reportType,
        reportData,
        company?.name ?? "School",
      );
      const filename = `${query.reportType}-report-${new Date().toISOString().slice(0, 10)}.pdf`;

      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/reports/export error:", error);
    return errorResponse("Failed to export report");
  }
}
