import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { stageInputSchema, validateStages } from "@/lib/crm/pipelines";
import { requireCrmCapability } from "../../_helpers";

const updatePipelineSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  /** The full stage list, in the order it should appear. */
  stages: z.array(stageInputSchema).max(30).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const pipeline = await prisma.crmPipeline.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        stages: {
          where: { archivedAt: null },
          orderBy: { position: "asc" },
          include: { _count: { select: { deals: true } } },
        },
        _count: { select: { deals: true } },
      },
    });
    if (!pipeline) return errorResponse("Pipeline not found", 404);

    return successResponse(pipeline);
  } catch (error) {
    console.error("[API] GET /api/v2/crm/pipelines/[id] error:", error);
    return errorResponse("Failed to fetch pipeline");
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "pipelines.manage")) {
      return errorResponse("Only managers can change pipelines", 403);
    }
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.crmPipeline.findFirst({
      where: { id, companyId },
      include: { stages: { where: { archivedAt: null }, select: { id: true } } },
    });
    if (!existing) return errorResponse("Pipeline not found", 404);

    const data = updatePipelineSchema.parse(await request.json());

    if (data.stages) {
      const errors = validateStages(data.stages);
      if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

      // Every id in the payload must already belong to this pipeline —
      // otherwise a stage could be stolen from another one.
      const known = new Set(existing.stages.map((stage) => stage.id));
      const unknown = data.stages.filter((stage) => stage.id && !known.has(stage.id));
      if (unknown.length > 0) return errorResponse("Unknown stage in the payload", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.crmPipeline.updateMany({
          where: { companyId, isDefault: true, id: { not: id } },
          data: { isDefault: false },
        });
      }

      if (data.stages) {
        const keptIds = data.stages.map((stage) => stage.id).filter(Boolean) as string[];
        const removed = existing.stages.filter((stage) => !keptIds.includes(stage.id));

        for (const stage of removed) {
          const dealCount = await tx.crmDeal.count({ where: { stageId: stage.id } });
          if (dealCount > 0) {
            // A stage with deals in it is archived rather than deleted, so the
            // deals keep a stage to point at and their history stays readable.
            await tx.crmPipelineStage.update({
              where: { id: stage.id },
              data: { archivedAt: new Date() },
            });
          } else {
            await tx.crmPipelineStage.delete({ where: { id: stage.id } });
          }
        }

        for (const [index, stage] of data.stages.entries()) {
          const payload = {
            companyId,
            pipelineId: id,
            name: stage.name,
            position: index,
            status: stage.status,
            probability: stage.probability,
            colorToken: stage.colorToken ?? null,
            inactivityDays: stage.inactivityDays ?? null,
            requiredFields: stage.requiredFields ?? [],
            checklist: (stage.checklist ?? undefined) as never,
            requiresSiteVisit: stage.requiresSiteVisit ?? false,
            requiresQuotation: stage.requiresQuotation ?? false,
          };
          if (stage.id) {
            await tx.crmPipelineStage.update({ where: { id: stage.id }, data: payload });
          } else {
            await tx.crmPipelineStage.create({ data: payload });
          }
        }
      }

      return tx.crmPipeline.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          isDefault: data.isDefault,
          isActive: data.isActive,
        },
        include: { stages: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] PATCH /api/v2/crm/pipelines/[id] error:", error);
    return errorResponse("Failed to update pipeline");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "pipelines.manage")) {
      return errorResponse("Only managers can delete pipelines", 403);
    }
    const companyId = session.user.companyId;
    const { id } = await params;

    const pipeline = await prisma.crmPipeline.findFirst({
      where: { id, companyId },
      include: { _count: { select: { deals: true } } },
    });
    if (!pipeline) return errorResponse("Pipeline not found", 404);
    if (pipeline.isDefault) {
      return errorResponse("Make another pipeline the default before deleting this one", 400);
    }
    if (pipeline._count.deals > 0) {
      return errorResponse(
        `${pipeline._count.deals} deal${pipeline._count.deals === 1 ? " is" : "s are"} still in this pipeline. Move them first, or deactivate it instead.`,
        400,
      );
    }

    await prisma.crmPipeline.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/pipelines/[id] error:", error);
    return errorResponse("Failed to delete pipeline");
  }
}
