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
import { carSalesDealStatusSchema, computeDealAmounts } from "../_helpers";

const dealsQuerySchema = z.object({
  status: carSalesDealStatusSchema.optional(),
  salespersonId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

const createDealSchema = z.object({
  dealNo: z.string().trim().min(1).max(32).optional(),
  leadId: z.string().uuid().nullable().optional(),
  vehicleId: z.string().uuid(),
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().min(1).max(40),
  salespersonId: z.string().uuid().optional(),
  quoteAmount: z.number().finite().nonnegative(),
  discountAmount: z.number().finite().nonnegative().optional(),
  taxAmount: z.number().finite().nonnegative().optional(),
  reservedUntil: z.string().datetime().nullable().optional(),
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

    const query = dealsQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      salespersonId: searchParams.get("salespersonId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where: Prisma.CarSalesDealWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.salespersonId ? { salespersonId: query.salespersonId } : {}),
      ...(query.search
        ? {
            OR: [
              { dealNo: { contains: query.search, mode: "insensitive" } },
              { customerName: { contains: query.search, mode: "insensitive" } },
              { customerPhone: { contains: query.search, mode: "insensitive" } },
              { vehicle: { stockNo: { contains: query.search, mode: "insensitive" } } },
              { vehicle: { vin: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.carSalesDeal.findMany({
        where,
        include: {
          vehicle: {
            select: {
              id: true,
              stockNo: true,
              vin: true,
              make: true,
              model: true,
              year: true,
              status: true,
            },
          },
          lead: {
            select: { id: true, leadNo: true, customerName: true, status: true },
          },
          salesperson: { select: { id: true, name: true, email: true } },
          _count: { select: { payments: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.carSalesDeal.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/autos/deals error:", error);
    return errorResponse("Failed to fetch deals");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createDealSchema.parse(body);

    const salespersonId = validated.salespersonId ?? session.user.id;
    const [salesperson, lead, vehicle] = await Promise.all([
      prisma.user.findFirst({
        where: { id: salespersonId, companyId },
        select: { id: true },
      }),
      validated.leadId
        ? prisma.carSalesLead.findFirst({
            where: { id: validated.leadId, companyId },
            select: { id: true, status: true },
          })
        : Promise.resolve(null),
      prisma.carSalesVehicle.findFirst({
        where: { id: validated.vehicleId, companyId },
        select: { id: true, status: true, minApprovalPrice: true },
      }),
    ]);

    if (!salesperson) return errorResponse("Salesperson does not belong to this company", 400);
    if (validated.leadId && !lead) return errorResponse("Lead not found", 400);
    if (!vehicle) return errorResponse("Vehicle not found", 400);
    if (vehicle.status === "SOLD" || vehicle.status === "DELIVERED") {
      return errorResponse("Vehicle is not available for new deals", 400);
    }

    const activeDeal = await prisma.carSalesDeal.findFirst({
      where: {
        companyId,
        vehicleId: validated.vehicleId,
        status: { in: ["RESERVED", "CONTRACTED", "DELIVERY_READY"] },
      },
      select: { id: true, dealNo: true, status: true },
    });
    if (activeDeal) {
      return errorResponse(
        `Vehicle already linked to active deal ${activeDeal.dealNo} (${activeDeal.status})`,
        409,
      );
    }

    const totals = computeDealAmounts({
      quoteAmount: validated.quoteAmount,
      discountAmount: validated.discountAmount,
      taxAmount: validated.taxAmount,
      paidAmount: 0,
    });
    if (totals.netAmount < vehicle.minApprovalPrice) {
      return errorResponse("Net amount is below vehicle minimum approval price", 400);
    }

    const dealNo =
      validated.dealNo?.trim().toUpperCase() ||
      (await reserveIdentifier(prisma, {
        companyId,
        entity: "CAR_SALES_DEAL",
      }));

    const created = await prisma.$transaction(async (tx) => {
      const deal = await tx.carSalesDeal.create({
        data: {
          companyId,
          dealNo,
          leadId: validated.leadId ?? null,
          vehicleId: validated.vehicleId,
          customerName: validated.customerName.trim(),
          customerPhone: validated.customerPhone.trim(),
          salespersonId,
          status: validated.reservedUntil ? "RESERVED" : "QUOTED",
          quoteAmount: totals.quoteAmount,
          discountAmount: totals.discountAmount,
          taxAmount: totals.taxAmount,
          netAmount: totals.netAmount,
          paidAmount: 0,
          balanceAmount: totals.balanceAmount,
          reservedUntil: validated.reservedUntil
            ? new Date(validated.reservedUntil)
            : null,
          notes: validated.notes?.trim() || null,
        },
      });

      if (lead && lead.status !== "WON") {
        await tx.carSalesLead.update({
          where: { id: lead.id },
          data: { status: "NEGOTIATION" },
        });
      }

      if (validated.reservedUntil) {
        await tx.carSalesVehicle.update({
          where: { id: validated.vehicleId },
          data: { status: "RESERVED" },
        });
      }

      return tx.carSalesDeal.findUnique({
        where: { id: deal.id },
        include: {
          vehicle: {
            select: {
              id: true,
              stockNo: true,
              vin: true,
              make: true,
              model: true,
              year: true,
              status: true,
            },
          },
          lead: {
            select: { id: true, leadNo: true, customerName: true, status: true },
          },
          salesperson: { select: { id: true, name: true, email: true } },
          _count: { select: { payments: true } },
        },
      });
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Deal number already exists", 409);
    }
    console.error("[API] POST /api/v2/autos/deals error:", error);
    return errorResponse("Failed to create deal");
  }
}
