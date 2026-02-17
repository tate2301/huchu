import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const vendorSchema = z.object({
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  address: z.string().max(300).optional(),
  taxNumber: z.string().max(100).optional(),
  vatNumber: z.string().max(100).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim();
    const active = searchParams.get("active");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { contactName: { contains: search, mode: "insensitive" } },
      ];
    }
    if (active !== null) where.isActive = active === "true";

    const [vendors, total] = await Promise.all([
      prisma.vendor.findMany({
        where,
        orderBy: [{ name: "asc" }],
        skip,
        take: limit,
      }),
      prisma.vendor.count({ where }),
    ]);

    return successResponse(paginationResponse(vendors, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/purchases/vendors error:", error);
    return errorResponse("Failed to fetch vendors");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = vendorSchema.parse(body);

    const vendor = await prisma.vendor.create({
      data: {
        companyId: session.user.companyId,
        name: validated.name,
        contactName: validated.contactName,
        phone: validated.phone,
        email: validated.email,
        address: validated.address,
        taxNumber: validated.taxNumber,
        vatNumber: validated.vatNumber,
        isActive: validated.isActive ?? true,
      },
    });

    return successResponse(vendor, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/purchases/vendors error:", error);
    return errorResponse("Failed to create vendor");
  }
}
