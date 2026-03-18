import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const sellerSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  phone: z.string().trim().min(1).max(50),
  nationalId: z.string().trim().min(1).max(80),
  address: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(1000).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const active = searchParams.get("active");
    const search = searchParams.get("search")?.trim();
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (active === "true") where.isActive = true;
    if (active === "false") where.isActive = false;
    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { nationalId: { contains: search, mode: "insensitive" } },
        { address: { contains: search, mode: "insensitive" } },
      ];
    }

    const [sellers, total] = await Promise.all([
      prisma.scrapSellerProfile.findMany({
        where,
        include: {
          _count: {
            select: {
              purchases: true,
            },
          },
        },
        orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
        skip,
        take: limit,
      }),
      prisma.scrapSellerProfile.count({ where }),
    ]);

    return successResponse(paginationResponse(sellers, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/sellers error:", error);
    return errorResponse("Failed to fetch scrap sellers");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = sellerSchema.parse(body);

    const existing = await prisma.scrapSellerProfile.findFirst({
      where: {
        companyId: session.user.companyId,
        nationalId: validated.nationalId,
      },
      select: { id: true },
    });

    if (existing) {
      return errorResponse("Seller national ID already exists", 409);
    }

    const seller = await prisma.scrapSellerProfile.create({
      data: {
        companyId: session.user.companyId,
        fullName: validated.fullName,
        phone: validated.phone,
        nationalId: validated.nationalId,
        address: validated.address || undefined,
        notes: validated.notes || undefined,
        isActive: validated.isActive ?? true,
      },
      include: {
        _count: {
          select: {
            purchases: true,
          },
        },
      },
    });

    return successResponse(seller, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/sellers error:", error);
    return errorResponse("Failed to create scrap seller");
  }
}

