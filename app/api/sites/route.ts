import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, hasRole } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { normalizeProvidedId, reserveIdentifier } from '@/lib/id-generator';

const siteSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20).optional(),
  location: z.string().max(200).optional(),
  measurementUnit: z.enum(['tonnes', 'trips', 'wheelbarrows']).optional(),
});

// GET - List all sites for user's company
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const search = searchParams.get("search")?.trim();

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    // Keep backward compatibility: default to active-only unless explicitly requested.
    if (active === null || active === "true") {
      where.isActive = true;
    } else if (active !== "all") {
      where.isActive = active === "true";
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ];
    }

    const sites = await prisma.site.findMany({
      where: {
        ...where,
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        measurementUnit: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    return successResponse({ sites });
  } catch (error) {
    console.error('[API] GET /api/sites error:', error);
    return errorResponse('Failed to fetch sites');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to create sites", 403);
    }

    const body = await request.json();
    const validated = siteSchema.parse(body);

    const name = validated.name.trim();
    const requestedCode = validated.code?.trim();
    const code = requestedCode
      ? normalizeProvidedId(requestedCode, "SITE")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "SITE",
        });
    const location = validated.location?.trim() || null;
    const measurementUnit = validated.measurementUnit ?? 'tonnes';

    if (!name) {
      return errorResponse('Site name is required', 400);
    }

    const existing = await prisma.site.findFirst({
      where: {
        companyId: session.user.companyId,
        code,
      },
      select: { id: true },
    });

    if (existing) {
      return errorResponse('Site code already exists', 409);
    }

    const site = await prisma.site.create({
      data: {
        name,
        code,
        location,
        measurementUnit,
        isActive: true,
        companyId: session.user.companyId,
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        measurementUnit: true,
        isActive: true,
      },
    });

    return successResponse(site, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/sites error:', error);
    return errorResponse('Failed to create site');
  }
}
