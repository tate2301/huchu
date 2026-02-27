import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolResultSheetStatusSchema } from "../_helpers";

const resultsQuerySchema = z.object({
  status: schoolResultSheetStatusSchema.optional(),
  termId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = resultsQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where: Prisma.SchoolResultSheetWhereInput = { companyId };
    if (query.status) where.status = query.status;
    if (query.termId) where.termId = query.termId;
    if (query.classId) where.classId = query.classId;
    if (query.streamId) where.streamId = query.streamId;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: "insensitive" } },
        { class: { name: { contains: query.search, mode: "insensitive" } } },
        { class: { code: { contains: query.search, mode: "insensitive" } } },
        { term: { name: { contains: query.search, mode: "insensitive" } } },
        { stream: { name: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [sheets, total, countsByStatus, publishWindows] = await Promise.all([
      prisma.schoolResultSheet.findMany({
        where,
        include: {
          term: { select: { id: true, code: true, name: true, isActive: true } },
          class: { select: { id: true, code: true, name: true } },
          stream: { select: { id: true, code: true, name: true } },
          _count: { select: { lines: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolResultSheet.count({ where }),
      prisma.schoolResultSheet.groupBy({
        by: ["status"],
        where: { companyId },
        _count: { _all: true },
      }),
      prisma.schoolPublishWindow.findMany({
        where: { companyId },
        include: {
          term: { select: { id: true, code: true, name: true } },
          class: { select: { id: true, code: true, name: true } },
          stream: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ openAt: "desc" }, { createdAt: "desc" }],
        take: 120,
      }),
    ]);

    const stats = sheets.length
      ? await prisma.schoolResultLine.groupBy({
          by: ["sheetId"],
          where: {
            companyId,
            sheetId: { in: sheets.map((sheet) => sheet.id) },
          },
          _avg: { score: true },
          _count: { _all: true },
        })
      : [];

    const statsMap = new Map(
      stats.map((row) => [
        row.sheetId,
        {
          averageScore: row._avg.score ?? null,
          linesCount: row._count._all,
        },
      ]),
    );

    const paged = paginationResponse(
      sheets.map((sheet) => ({
        ...sheet,
        stats: statsMap.get(sheet.id) ?? {
          averageScore: null,
          linesCount: sheet._count.lines,
        },
      })),
      total,
      page,
      limit,
    );

    return successResponse({
      success: true,
      data: {
        resource: "schools-results",
        companyId,
        ...paged,
        publishWindows,
        summary: {
          totalSheets: countsByStatus.reduce(
            (sum, row) => sum + row._count._all,
            0,
          ),
          draftSheets:
            countsByStatus.find((row) => row.status === "DRAFT")?._count._all ??
            0,
          submittedSheets:
            countsByStatus.find((row) => row.status === "SUBMITTED")?._count
              ._all ?? 0,
          hodApprovedSheets:
            countsByStatus.find((row) => row.status === "HOD_APPROVED")?._count
              ._all ?? 0,
          hodRejectedSheets:
            countsByStatus.find((row) => row.status === "HOD_REJECTED")?._count
              ._all ?? 0,
          publishedSheets:
            countsByStatus.find((row) => row.status === "PUBLISHED")?._count
              ._all ?? 0,
          openPublishWindows: publishWindows.filter((row) => row.status === "OPEN")
            .length,
          scheduledPublishWindows: publishWindows.filter(
            (row) => row.status === "SCHEDULED",
          ).length,
          closedPublishWindows: publishWindows.filter((row) => row.status === "CLOSED")
            .length,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/results error:", error);
    return errorResponse("Failed to fetch schools results data");
  }
}
