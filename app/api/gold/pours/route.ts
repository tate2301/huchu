import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { captureAccountingEvent } from "@/lib/accounting/integration";
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";

const goldPourSchema = z.object({
  pourBarId: z.string().min(1).max(50).optional(),
  siteId: z.string().uuid(),
  pourDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  grossWeight: z.number().positive(),
  witness1Id: z.string().uuid(),
  witness2Id: z.string().uuid(),
  storageLocation: z.string().min(1).max(200),
  estimatedPurity: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const sourceType = searchParams.get("sourceType");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (sourceType === "PRODUCTION" || sourceType === "PURCHASE_PUBLIC") {
      where.sourceType = sourceType;
    }
    const [pours, total] = await Promise.all([
      prisma.goldPour.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          witness1: { select: { name: true } },
          witness2: { select: { name: true } },
        },
        orderBy: { pourDate: 'desc' },
        skip,
        take: limit,
      }),
      prisma.goldPour.count({ where }),
    ]);

    const normalizedPours = pours.map((pour) => ({
      ...pour,
      batchId: pour.id,
      batchCode: pour.pourBarId,
    }));

    return successResponse(paginationResponse(normalizedPours, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/gold/pours error:', error);
    return errorResponse('Failed to fetch gold pours');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = goldPourSchema.parse(body);

    // Validate witness rule (must be different)
    if (validated.witness1Id === validated.witness2Id) {
      return errorResponse('Witness 1 and Witness 2 must be different persons', 400);
    }

    // Verify site and witnesses belong to company
    const [site, witness1, witness2] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true, isActive: true },
      }),
      prisma.employee.findUnique({
        where: { id: validated.witness1Id },
        select: { companyId: true, isActive: true },
      }),
      prisma.employee.findUnique({
        where: { id: validated.witness2Id },
        select: { companyId: true, isActive: true },
      }),
    ]);

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse('Invalid site', 403);
    }

    if (!site.isActive) {
      return errorResponse('Site is not active', 400);
    }

    if (!witness1 || witness1.companyId !== session.user.companyId || !witness1.isActive) {
      return errorResponse('Invalid witness 1', 400);
    }

    if (!witness2 || witness2.companyId !== session.user.companyId || !witness2.isActive) {
      return errorResponse('Invalid witness 2', 400);
    }

    const pourBarId = validated.pourBarId
      ? normalizeProvidedId(validated.pourBarId, "GOLD_POUR")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "GOLD_POUR",
        });

    const existingPour = await prisma.goldPour.findUnique({
      where: { pourBarId },
      select: { id: true },
    });

    if (existingPour) {
      return errorResponse('Pour/Bar ID already exists', 409);
    }

    // Create gold pour
    const pour = await prisma.goldPour.create({
      data: {
        siteId: validated.siteId,
        pourBarId,
        pourDate: new Date(validated.pourDate),
        grossWeight: validated.grossWeight,
        witness1Id: validated.witness1Id,
        witness2Id: validated.witness2Id,
        storageLocation: validated.storageLocation,
        estimatedPurity: validated.estimatedPurity,
        notes: validated.notes,
      },
      include: {
        site: { select: { name: true, code: true } },
        witness1: { select: { name: true } },
        witness2: { select: { name: true } },
      },
    });

    try {
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "gold",
        sourceAction: "pour-created",
        sourceId: pour.id,
        entryDate: pour.pourDate,
        description: `Gold pour ${pour.pourBarId} created`,
        amount: pour.grossWeight,
        payload: {
          siteId: pour.siteId,
          storageLocation: pour.storageLocation,
          estimatedPurity: pour.estimatedPurity,
        },
        createdById: session.user.id,
        status: "IGNORED",
      });
    } catch (error) {
      console.error("[Accounting] Gold pour capture failed:", error);
    }

    return successResponse(
      {
        ...pour,
        batchId: pour.id,
        batchCode: pour.pourBarId,
      },
      201,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/gold/pours error:', error);
    return errorResponse('Failed to create gold pour');
  }
}
