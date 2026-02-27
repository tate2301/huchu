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
import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { carSalesLeadStatusSchema } from "../_helpers";

const leadsQuerySchema = z.object({
  status: carSalesLeadStatusSchema.optional(),
  assignedToId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

const createLeadSchema = z.object({
  leadNo: z.string().trim().min(1).max(32).optional(),
  customerName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(200).nullable().optional(),
  source: z.string().trim().min(1).max(40).optional(),
  vehicleInterest: z.string().trim().min(1).max(120).nullable().optional(),
  budgetMin: z.number().finite().nonnegative().nullable().optional(),
  budgetMax: z.number().finite().nonnegative().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  notes: z.string().trim().min(1).max(2000).nullable().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = leadsQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      assignedToId: searchParams.get("assignedToId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where: Prisma.CarSalesLeadWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(query.search
        ? {
            OR: [
              { leadNo: { contains: query.search, mode: "insensitive" } },
              { customerName: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { vehicleInterest: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.carSalesLead.findMany({
        where,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          _count: { select: { deals: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.carSalesLead.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/autos/leads error:", error);
    return errorResponse("Failed to fetch car sales leads");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createLeadSchema.parse(body);

    if (validated.assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: validated.assignedToId, companyId },
        select: { id: true },
      });
      if (!assignee) {
        return errorResponse("Assigned user does not belong to this company", 400);
      }
    }

    const leadNo =
      validated.leadNo?.trim().toUpperCase() ||
      (await reserveIdentifier(prisma, {
        companyId,
        entity: "CAR_SALES_LEAD",
      }));

    const created = await prisma.carSalesLead.create({
      data: {
        companyId,
        leadNo,
        customerName: validated.customerName.trim(),
        phone: validated.phone.trim(),
        email: validated.email?.trim() || null,
        source: validated.source?.trim().toUpperCase() || "WALK_IN",
        vehicleInterest: validated.vehicleInterest?.trim() || null,
        budgetMin: validated.budgetMin ?? null,
        budgetMax: validated.budgetMax ?? null,
        assignedToId: validated.assignedToId ?? null,
        notes: validated.notes?.trim() || null,
      },
      include: {
        assignedTo: { select: { id: true, name: true, email: true } },
        _count: { select: { deals: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Lead number already exists", 409);
    }
    console.error("[API] POST /api/v2/autos/leads error:", error);
    return errorResponse("Failed to create car sales lead");
  }
}
