import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const goldPourSchema = z.object({
  siteId: z.string().uuid(),
  pourDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  grossWeight: z.number().positive(),
  witness1Id: z.string().uuid(),
  witness2Id: z.string().uuid(),
  storageLocation: z.string().min(1).max(200),
  estimatedPurity: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
});

function formatTwoDigits(value: number) {
  return String(value).padStart(2, '0');
}

function buildPourBarIdCandidate() {
  const now = new Date();
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`;
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}${formatTwoDigits(now.getSeconds())}`;
  const randomPart = Math.floor(100 + Math.random() * 900);
  return `BAR-${datePart}-${timePart}-${randomPart}`;
}

async function generateUniquePourBarId() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildPourBarIdCandidate();
    const existing = await prisma.goldPour.findUnique({
      where: { pourBarId: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  return `BAR-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
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

    const pourBarId = await generateUniquePourBarId();

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
