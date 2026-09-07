import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, validateSession } from "@corelithzw/platform/api-utils";
import { renderDocumentSync } from "@corelithzw/module-documents/service";
import {
  generateCollectionsReport,
  generateArrearsAgingReport,
  generateEnrollmentStatsReport,
  generateOccupancyReport,
} from "../../../../../reports";
import { schoolPermissionDenial } from "../../../../../permissions";

/**
 * S-5.4 — a school report export is a real file.
 *
 * It used to call two placeholders in `lib/schools/reports.ts`: a hand-rolled CSV
 * joiner with no quoting — one comma in a hostel's name and every column after it
 * moved — and an `exportReportToPDF` that returned
 * `Buffer.from(JSON.stringify(data))` under a `application/pdf` header. A head who
 * clicked Export got a file their reader refused to open, which is worse than a
 * button that is not there.
 *
 * Both are gone. This hands the rows to `renderDocumentSync`, which is the same
 * pipeline the invoices, the receipts and the report cards go through: the
 * tenant's letterhead, a template the school can edit, a real PDF renderer, and a
 * CSV renderer that quotes.
 *
 * The columns are declared here rather than derived from `Object.keys(rows[0])`.
 * Derived columns put `termId` and `studentId` on a page a board reads, in
 * whatever order the query happened to select them, and label them `studentId`.
 */

const querySchema = z.object({
  reportType: z.enum(["collections", "arrears", "enrollment", "occupancy"]),
  format: z.enum(["csv", "pdf"]),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  // The board's own filters, so the file a head downloads is the rows they were
  // looking at. An export that quietly widens back to the whole school is worse
  // than no export: it is a different report under the same name.
  academicYearId: z.string().uuid().optional(),
  feeStructureId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  boarding: z.enum(["BOARDING", "DAY"]).optional(),
  minOutstanding: z.coerce.number().min(0).optional(),
  oldestAtLeast: z.enum(["days30", "days60", "days90", "days120Plus"]).optional(),
});

type Column = { key: string; label: string };

const REPORTS: Record<
  z.infer<typeof querySchema>["reportType"],
  { title: string; columns: Column[] }
> = {
  collections: {
    title: "Fee collections",
    columns: [
      { key: "period", label: "Period" },
      { key: "termName", label: "Term" },
      { key: "invoiced", label: "Invoiced" },
      { key: "collected", label: "Collected" },
      { key: "collectionRate", label: "Collected %" },
      { key: "receiptsCount", label: "Receipts" },
    ],
  },
  arrears: {
    title: "Arrears aging",
    columns: [
      { key: "studentNo", label: "Student no." },
      { key: "studentName", label: "Pupil" },
      { key: "className", label: "Class" },
      { key: "totalOutstanding", label: "Outstanding" },
      { key: "current", label: "Current" },
      { key: "days30", label: "30 days" },
      { key: "days60", label: "60 days" },
      { key: "days90", label: "90 days" },
      { key: "days120Plus", label: "120+ days" },
    ],
  },
  enrollment: {
    title: "Enrolment",
    columns: [
      { key: "period", label: "Period" },
      { key: "termName", label: "Term" },
      { key: "totalEnrolled", label: "Enrolled" },
      { key: "boardingCount", label: "Boarders" },
      { key: "dayCount", label: "Day pupils" },
      { key: "maleCount", label: "Boys" },
      { key: "femaleCount", label: "Girls" },
    ],
  },
  occupancy: {
    title: "Hostel occupancy",
    columns: [
      { key: "hostelCode", label: "Code" },
      { key: "hostelName", label: "Hostel" },
      { key: "genderPolicy", label: "Takes" },
      { key: "roomCount", label: "Rooms" },
      { key: "totalBeds", label: "Beds" },
      { key: "occupiedBeds", label: "Occupied" },
      { key: "occupancyRate", label: "Occupied %" },
    ],
  },
};

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.reports", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      reportType: searchParams.get("reportType") ?? undefined,
      format: searchParams.get("format") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      startDate: searchParams.get("startDate") ?? undefined,
      endDate: searchParams.get("endDate") ?? undefined,
      academicYearId: searchParams.get("academicYearId") ?? undefined,
      feeStructureId: searchParams.get("feeStructureId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      boarding: searchParams.get("boarding") ?? undefined,
      minOutstanding: searchParams.get("minOutstanding") ?? undefined,
      oldestAtLeast: searchParams.get("oldestAtLeast") ?? undefined,
    });

    let rows: Array<Record<string, unknown>> = [];

    switch (query.reportType) {
      case "collections": {
        const options: Parameters<typeof generateCollectionsReport>[1] = {};
        if (query.startDate) options.startDate = new Date(query.startDate);
        if (query.endDate) options.endDate = new Date(query.endDate);
        if (query.termId) options.termId = query.termId;
        if (query.academicYearId) options.academicYearId = query.academicYearId;
        if (query.classId) options.classId = query.classId;
        if (query.feeStructureId) options.feeStructureId = query.feeStructureId;
        rows = await generateCollectionsReport(companyId, options);
        break;
      }
      case "arrears": {
        rows = await generateArrearsAgingReport(companyId, {
          ...(query.termId ? { termId: query.termId } : {}),
          ...(query.classId ? { classId: query.classId } : {}),
          ...(query.streamId ? { streamId: query.streamId } : {}),
          ...(query.boarding ? { isBoarding: query.boarding === "BOARDING" } : {}),
          ...(query.minOutstanding !== undefined
            ? { minOutstanding: query.minOutstanding }
            : {}),
          ...(query.oldestAtLeast ? { oldestAtLeast: query.oldestAtLeast } : {}),
        });
        break;
      }
      case "enrollment": {
        const options: Parameters<typeof generateEnrollmentStatsReport>[1] = {};
        if (query.termId) options.termId = query.termId;
        if (query.startDate) options.startDate = new Date(query.startDate);
        if (query.endDate) options.endDate = new Date(query.endDate);
        rows = await generateEnrollmentStatsReport(companyId, options);
        break;
      }
      case "occupancy": {
        rows = await generateOccupancyReport(companyId);
        break;
      }
    }

    const report = REPORTS[query.reportType];
    const stamp = new Date().toISOString().slice(0, 10);

    const rendered = await renderDocumentSync(companyId, {
      target: "LIST",
      // Under `ui.table.*` in the template catalogue, which is the entry for a
      // table the caller supplies. A school that wants its own layout for these
      // makes a template against this key.
      sourceKey: `ui.table.schools.${query.reportType}`,
      format: query.format,
      // SYNC even for a long arrears list. A head pressed Export and is waiting
      // on the response; queueing it would answer with a job id the screen has no
      // way to collect.
      mode: "SYNC",
      payload: {
        title: report.title,
        subtitle: `Generated ${stamp}`,
        fileName: `${query.reportType}-report-${stamp}`,
        meta: [
          { label: "Report", value: report.title },
          { label: "Generated", value: stamp },
          { label: "Rows", value: String(rows.length) },
        ],
        list: {
          columns: report.columns,
          // Only the declared columns, in the declared order, so an id the query
          // needed never reaches the page.
          rows: rows.map((row) =>
            Object.fromEntries(
              report.columns.map((column) => [column.key, row[column.key] ?? ""]),
            ),
          ),
        },
      },
    });

    return new NextResponse(new Uint8Array(rendered.data), {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `attachment; filename="${rendered.fileName}"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/reports/export error:", error);
    return errorResponse("Failed to export report");
  }
}
