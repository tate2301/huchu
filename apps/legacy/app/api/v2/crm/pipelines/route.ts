import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  DEFAULT_STAGE_TEMPLATE,
  ensureDefaultPipeline,
  stageInputSchema,
  validateStages,
  type StageInput,
  type StageTemplate,
} from "@/lib/crm/pipelines";
import { requireCrmCapability } from "../_helpers";

const createPipelineSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
  /** Start from the shipped template, copy another pipeline, or supply stages. */
  template: z.enum(["DEFAULT", "BLANK"]).optional(),
  duplicateFromId: z.string().uuid().optional(),
  stages: z.array(stageInputSchema).max(30).optional(),
});

/** The smallest pipeline that still answers "did we win this?". */
const BLANK_TEMPLATE: StageTemplate[] = [
  { name: "Open", status: "OPEN", probability: 25 },
  { name: "Won", status: "WON", probability: 100 },
  { name: "Lost", status: "LOST", probability: 0 },
];

function templateToStages(template: StageTemplate[]): StageInput[] {
  return template.map((stage) => ({
    name: stage.name,
    status: stage.status,
    probability: stage.probability,
    colorToken: stage.colorToken ?? null,
    inactivityDays: stage.inactivityDays ?? null,
    requiredFields: [],
    checklist: stage.checklist ?? null,
    requiresSiteVisit: stage.requiresSiteVisit ?? false,
    requiresQuotation: stage.requiresQuotation ?? false,
  }));
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // A company always has at least the default pipeline, created on first read
    // so the deal endpoints never have to cope with there being none.
    await prisma.$transaction((tx) => ensureDefaultPipeline(tx, session.user.companyId));

    const pipelines = await prisma.crmPipeline.findMany({
      where: { companyId: session.user.companyId },
      include: {
        stages: {
          where: { archivedAt: null },
          orderBy: { position: "asc" },
          // How many deals are sitting in each stage. The setup page draws this
          // as its "In it now" column: a stage's settings — the probability, the
          // idle rule, what it gates — mean little without knowing whether
          // anything is actually in it. A pipeline where everything has piled up
          // in Quoted is the fact this screen exists to surface, and it was the
          // one fact it did not carry.
          include: { _count: { select: { deals: true } } },
        },
        _count: { select: { deals: true } },
      },
      orderBy: [{ isDefault: "desc" }, { position: "asc" }, { name: "asc" }],
    });

    return successResponse({ data: pipelines });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/pipelines error:", error);
    return errorResponse("Failed to fetch pipelines");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!await requireCrmCapability(session, "pipelines.manage")) {
      return errorResponse("Only managers can create pipelines", 403);
    }
    const companyId = session.user.companyId;

    const data = createPipelineSchema.parse(await request.json());

    let stages: StageInput[] | undefined = data.stages;
    if (!stages && data.duplicateFromId) {
      const source = await prisma.crmPipeline.findFirst({
        where: { id: data.duplicateFromId, companyId },
        include: { stages: { where: { archivedAt: null }, orderBy: { position: "asc" } } },
      });
      if (!source) return errorResponse("Pipeline to duplicate not found", 404);
      stages = source.stages.map((stage) => ({
        name: stage.name,
        status: stage.status,
        probability: stage.probability,
        colorToken: stage.colorToken,
        inactivityDays: stage.inactivityDays,
        requiredFields: stage.requiredFields,
        checklist: stage.checklist as StageInput["checklist"],
        requiresSiteVisit: stage.requiresSiteVisit,
        requiresQuotation: stage.requiresQuotation,
      }));
    }
    if (!stages) {
      stages = templateToStages(
        data.template === "BLANK" ? BLANK_TEMPLATE : DEFAULT_STAGE_TEMPLATE,
      );
    }

    const resolvedStages = stages;
    const errors = validateStages(resolvedStages);
    if (errors.length > 0) return errorResponse("Validation failed", 400, errors);

    const pipeline = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.crmPipeline.updateMany({
          where: { companyId, isDefault: true },
          data: { isDefault: false },
        });
      }
      const count = await tx.crmPipeline.count({ where: { companyId } });
      return tx.crmPipeline.create({
        data: {
          companyId,
          name: data.name,
          description: data.description ?? undefined,
          isDefault: data.isDefault ?? false,
          position: count,
          createdById: session.user.id,
          stages: {
            create: resolvedStages.map((stage, index) => ({
              companyId,
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
            })),
          },
        },
        include: { stages: { orderBy: { position: "asc" } } },
      });
    });

    return successResponse(pipeline, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/crm/pipelines error:", error);
    return errorResponse("Failed to create pipeline");
  }
}
