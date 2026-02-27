import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const downtimeEventSchema = z.object({
  downtimeCodeId: z.string().uuid(),
  durationHours: z.number().min(0).max(24),
  notes: z.string().max(500).nullable().optional(),
});

const plantReportUpdateSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  siteId: z.string().uuid().optional(),
  tonnesFed: z.number().min(0).nullable().optional(),
  tonnesProcessed: z.number().min(0).nullable().optional(),
  runHours: z.number().min(0).max(24).nullable().optional(),
  dieselUsed: z.number().min(0).nullable().optional(),
  grindingMedia: z.number().min(0).nullable().optional(),
  reagentsUsed: z.number().min(0).nullable().optional(),
  waterUsed: z.number().min(0).nullable().optional(),
  goldRecovered: z.number().min(0).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  downtimeEvents: z.array(downtimeEventSchema).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

function buildInclude() {
  return {
    site: { select: { name: true, code: true } },
    reportedBy: { select: { name: true } },
    downtimeEvents: {
      include: {
        downtimeCode: { select: { description: true, code: true } },
      },
    },
  } satisfies Prisma.PlantReportInclude;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await params;

    const report = await prisma.plantReport.findUnique({
      where: { id },
      include: {
        ...buildInclude(),
        site: { select: { id: true, name: true, code: true, companyId: true } },
      },
    });

    if (!report) {
      return errorResponse("Plant report not found", 404);
    }

    if (report.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403);
    }

    return successResponse(report);
  } catch (error) {
    console.error("[API] GET /api/plant-reports/[id] error:", error);
    return errorResponse("Failed to fetch plant report");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN"])) {
      return errorResponse("Only SUPERADMIN can update plant reports.", 403);
    }

    const { id } = await params;
    const body = await request.json();
    const validated = plantReportUpdateSchema.parse(body);

    const existing = await prisma.plantReport.findUnique({
      where: { id },
      include: { site: { select: { id: true, companyId: true } } },
    });

    if (!existing) {
      return errorResponse("Plant report not found", 404);
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403);
    }

    const resolvedSiteId = validated.siteId ?? existing.siteId;

    if (validated.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true },
      });
      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 400);
      }
    }

    if (validated.downtimeEvents !== undefined && validated.downtimeEvents.length > 0) {
      const downtimeCodeIds = Array.from(
        new Set(validated.downtimeEvents.map((event) => event.downtimeCodeId)),
      );
      const downtimeCodes = await prisma.downtimeCode.findMany({
        where: {
          id: { in: downtimeCodeIds },
          OR: [{ siteId: resolvedSiteId }, { siteId: null }],
        },
        select: { id: true },
      });

      if (downtimeCodes.length !== downtimeCodeIds.length) {
        return errorResponse("Invalid downtime code for site", 400);
      }
    }

    const updateData: Prisma.PlantReportUpdateInput = {};

    if (validated.date !== undefined) updateData.date = new Date(validated.date);
    if (validated.siteId !== undefined) {
      updateData.site = { connect: { id: validated.siteId } };
    }
    if (validated.tonnesFed !== undefined) updateData.tonnesFed = validated.tonnesFed;
    if (validated.tonnesProcessed !== undefined) updateData.tonnesProcessed = validated.tonnesProcessed;
    if (validated.runHours !== undefined) updateData.runHours = validated.runHours;
    if (validated.dieselUsed !== undefined) updateData.dieselUsed = validated.dieselUsed;
    if (validated.grindingMedia !== undefined) updateData.grindingMedia = validated.grindingMedia;
    if (validated.reagentsUsed !== undefined) updateData.reagentsUsed = validated.reagentsUsed;
    if (validated.waterUsed !== undefined) updateData.waterUsed = validated.waterUsed;
    if (validated.goldRecovered !== undefined) updateData.goldRecovered = validated.goldRecovered;
    if (validated.notes !== undefined) updateData.notes = validated.notes;

    const updated = await prisma.$transaction(async (tx) => {
      await tx.plantReport.update({
        where: { id },
        data: updateData,
      });

      if (validated.downtimeEvents !== undefined) {
        await tx.downtimeEvent.deleteMany({ where: { plantReportId: id } });

        if (validated.downtimeEvents.length > 0) {
          await tx.downtimeEvent.createMany({
            data: validated.downtimeEvents.map((event) => ({
              plantReportId: id,
              downtimeCodeId: event.downtimeCodeId,
              durationHours: event.durationHours,
              notes: event.notes ?? null,
            })),
          });
        }
      }

      return tx.plantReport.findUnique({
        where: { id },
        include: buildInclude(),
      });
    });

    if (!updated) {
      return errorResponse("Plant report not found", 404);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/plant-reports/[id] error:", error);
    return errorResponse("Failed to update plant report");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN"])) {
      return errorResponse("Only SUPERADMIN can delete plant reports.", 403);
    }

    const { id } = await params;

    const existing = await prisma.plantReport.findUnique({
      where: { id },
      include: { site: { select: { companyId: true } } },
    });

    if (!existing) {
      return errorResponse("Plant report not found", 404);
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403);
    }

    await prisma.plantReport.delete({
      where: { id },
    });

    return successResponse({ success: true, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/plant-reports/[id] error:", error);
    return errorResponse("Failed to delete plant report");
  }
}
