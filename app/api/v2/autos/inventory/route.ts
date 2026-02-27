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
import { carSalesVehicleStatusSchema } from "../_helpers";

const inventoryQuerySchema = z.object({
  status: carSalesVehicleStatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

const createVehicleSchema = z.object({
  stockNo: z.string().trim().min(1).max(32).optional(),
  vin: z.string().trim().min(3).max(80),
  make: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(120),
  year: z.number().int().min(1950).max(2100),
  color: z.string().trim().min(1).max(40).nullable().optional(),
  mileageKm: z.number().int().min(0).nullable().optional(),
  acquisitionDate: z.string().datetime().nullable().optional(),
  acquisitionCost: z.number().finite().nonnegative().optional(),
  listingPrice: z.number().finite().nonnegative(),
  minApprovalPrice: z.number().finite().nonnegative(),
  currency: z.string().trim().min(3).max(3).optional(),
  status: carSalesVehicleStatusSchema.optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = getPaginationParams(request);

    const query = inventoryQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where: Prisma.CarSalesVehicleWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { stockNo: { contains: query.search, mode: "insensitive" } },
              { vin: { contains: query.search, mode: "insensitive" } },
              { make: { contains: query.search, mode: "insensitive" } },
              { model: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.carSalesVehicle.findMany({
        where,
        include: {
          _count: { select: { deals: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.carSalesVehicle.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/autos/inventory error:", error);
    return errorResponse("Failed to fetch vehicle inventory");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createVehicleSchema.parse(body);
    if (validated.minApprovalPrice > validated.listingPrice) {
      return errorResponse("minApprovalPrice cannot exceed listingPrice", 400);
    }

    const stockNo =
      validated.stockNo?.trim().toUpperCase() ||
      (await reserveIdentifier(prisma, {
        companyId,
        entity: "CAR_SALES_VEHICLE",
      }));

    const created = await prisma.carSalesVehicle.create({
      data: {
        companyId,
        stockNo,
        vin: validated.vin.trim().toUpperCase(),
        make: validated.make.trim(),
        model: validated.model.trim(),
        year: validated.year,
        color: validated.color?.trim() || null,
        mileageKm: validated.mileageKm ?? null,
        acquisitionDate: validated.acquisitionDate
          ? new Date(validated.acquisitionDate)
          : null,
        acquisitionCost: validated.acquisitionCost ?? 0,
        listingPrice: validated.listingPrice,
        minApprovalPrice: validated.minApprovalPrice,
        currency: validated.currency?.trim().toUpperCase() || "USD",
        status: validated.status ?? "IN_STOCK",
      },
      include: {
        _count: { select: { deals: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Vehicle stock number or VIN already exists", 409);
    }
    console.error("[API] POST /api/v2/autos/inventory error:", error);
    return errorResponse("Failed to create vehicle");
  }
}
