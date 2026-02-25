import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { captureAccountingEvent } from "@/lib/accounting/integration";
import { prisma } from "@/lib/prisma";

const correctionSchema = z.object({
  entityType: z.enum(["POUR", "DISPATCH", "RECEIPT"]),
  entityId: z.string().uuid(),
  reason: z.string().min(3).max(1000),
  beforeSnapshot: z.unknown().optional(),
  afterSnapshot: z.unknown().optional(),
});

type GoldCorrectionEvent = {
  id: string;
  pourId: string;
  entityType: "POUR" | "DISPATCH" | "RECEIPT";
  entityId: string;
  reason: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  createdAt: string;
  createdBy: { id: string; name: string };
};

function parseCorrections(raw: string | null): GoldCorrectionEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.pourId === "string" &&
        typeof item.entityType === "string" &&
        typeof item.entityId === "string" &&
        typeof item.reason === "string" &&
        typeof item.createdAt === "string" &&
        item.createdBy &&
        typeof item.createdBy.id === "string" &&
        typeof item.createdBy.name === "string",
    ) as GoldCorrectionEvent[];
  } catch {
    return [];
  }
}

async function resolveCorrectionTarget(
  companyId: string,
  entityType: "POUR" | "DISPATCH" | "RECEIPT",
  entityId: string,
) {
  if (entityType === "POUR") {
    const pour = await prisma.goldPour.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        site: { select: { companyId: true } },
      },
    });
    if (!pour || pour.site.companyId !== companyId) return null;
    return { pourId: pour.id };
  }

  if (entityType === "DISPATCH") {
    const dispatch = await prisma.goldDispatch.findUnique({
      where: { id: entityId },
      select: {
        id: true,
        goldPour: {
          select: {
            id: true,
            site: { select: { companyId: true } },
          },
        },
      },
    });
    if (!dispatch || dispatch.goldPour.site.companyId !== companyId) return null;
    return { pourId: dispatch.goldPour.id };
  }

  const receipt = await prisma.buyerReceipt.findUnique({
    where: { id: entityId },
    select: {
      id: true,
      goldPour: {
        select: {
          id: true,
          site: { select: { companyId: true } },
        },
      },
      goldDispatch: {
        select: {
          goldPour: {
            select: {
              id: true,
              site: { select: { companyId: true } },
            },
          },
        },
      },
    },
  });

  const receiptPour = receipt?.goldPour ?? receipt?.goldDispatch?.goldPour
  if (!receipt || !receiptPour || receiptPour.site.companyId !== companyId) {
    return null;
  }
  return { pourId: receiptPour.id };
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get("siteId");
    const pourId = searchParams.get("pourId");
    const entityType = searchParams.get("entityType");
    const { page, limit } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };
    if (siteId) where.siteId = siteId;
    if (pourId) where.id = pourId;

    const pours = await prisma.goldPour.findMany({
      where,
      select: {
        id: true,
        pourBarId: true,
        site: { select: { id: true, name: true, code: true } },
        corrections: true,
      },
      orderBy: { pourDate: "desc" },
    });

    const flattened = pours.flatMap((pour) => {
      const entries = parseCorrections(pour.corrections);
      return entries
        .filter((entry) => !entityType || entry.entityType === entityType)
        .map((entry) => ({
          ...entry,
          pour: {
            id: pour.id,
            pourBarId: pour.pourBarId,
            site: pour.site,
          },
        }));
    });

    flattened.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    const total = flattened.length;
    const start = (page - 1) * limit;
    const paged = flattened.slice(start, start + limit);

    return successResponse(paginationResponse(paged, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/gold/corrections error:", error);
    return errorResponse("Failed to fetch gold corrections");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = correctionSchema.parse(body);

    const target = await resolveCorrectionTarget(
      session.user.companyId,
      validated.entityType,
      validated.entityId,
    );
    if (!target) {
      return errorResponse("Entity not found", 404);
    }

    const pour = await prisma.goldPour.findUnique({
      where: { id: target.pourId },
      select: {
        id: true,
        corrections: true,
        pourBarId: true,
        site: { select: { id: true, name: true, code: true } },
      },
    });

    if (!pour) {
      return errorResponse("Associated pour not found", 404);
    }

    const existingCorrections = parseCorrections(pour.corrections);
    const newEntry: GoldCorrectionEvent = {
      id: randomUUID(),
      pourId: pour.id,
      entityType: validated.entityType,
      entityId: validated.entityId,
      reason: validated.reason,
      beforeSnapshot: validated.beforeSnapshot,
      afterSnapshot: validated.afterSnapshot,
      createdAt: new Date().toISOString(),
      createdBy: {
        id: session.user.id,
        name: session.user.name,
      },
    };

    await prisma.goldPour.update({
      where: { id: pour.id },
      data: {
        corrections: JSON.stringify([...existingCorrections, newEntry]),
      },
    });

    try {
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "gold",
        sourceAction: "correction-created",
        sourceId: newEntry.id,
        description: `Gold correction on ${validated.entityType} ${validated.entityId}`,
        payload: {
          pourId: pour.id,
          entityType: validated.entityType,
          entityId: validated.entityId,
          reason: validated.reason,
        },
        createdById: session.user.id,
        status: "IGNORED",
      });
    } catch (error) {
      console.error("[Accounting] Gold correction capture failed:", error);
    }

    return successResponse(
      {
        ...newEntry,
        pour: {
          id: pour.id,
          pourBarId: pour.pourBarId,
          site: pour.site,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/gold/corrections error:", error);
    return errorResponse("Failed to save correction");
  }
}
