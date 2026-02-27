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
import { carSalesPaymentMethodSchema, carSalesPaymentStatusSchema } from "../_helpers";

const paymentsQuerySchema = z.object({
  dealId: z.string().uuid().optional(),
  status: carSalesPaymentStatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

const createPaymentSchema = z.object({
  paymentNo: z.string().trim().min(1).max(32).optional(),
  dealId: z.string().uuid(),
  paymentDate: z.string().datetime(),
  paymentMethod: carSalesPaymentMethodSchema,
  amount: z.number().finite().positive(),
  reference: z.string().trim().min(1).max(120).nullable().optional(),
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

    const query = paymentsQuerySchema.parse({
      dealId: searchParams.get("dealId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const where: Prisma.CarSalesPaymentWhereInput = {
      companyId,
      ...(query.dealId ? { dealId: query.dealId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { paymentNo: { contains: query.search, mode: "insensitive" } },
              { reference: { contains: query.search, mode: "insensitive" } },
              { deal: { dealNo: { contains: query.search, mode: "insensitive" } } },
              { deal: { customerName: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [records, total] = await Promise.all([
      prisma.carSalesPayment.findMany({
        where,
        include: {
          deal: {
            select: {
              id: true,
              dealNo: true,
              customerName: true,
              status: true,
              netAmount: true,
              paidAmount: true,
              balanceAmount: true,
            },
          },
          receivedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.carSalesPayment.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/autos/financing error:", error);
    return errorResponse("Failed to fetch deal payments");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createPaymentSchema.parse(body);

    const deal = await prisma.carSalesDeal.findFirst({
      where: { id: validated.dealId, companyId },
      select: {
        id: true,
        status: true,
        netAmount: true,
        paidAmount: true,
        balanceAmount: true,
      },
    });
    if (!deal) return errorResponse("Deal not found", 404);
    if (["CANCELED", "VOIDED"].includes(deal.status)) {
      return errorResponse("Cannot post payment to canceled or voided deal", 400);
    }
    if (validated.amount > deal.balanceAmount) {
      return errorResponse("Payment amount exceeds deal balance", 400);
    }

    const paymentNo =
      validated.paymentNo?.trim().toUpperCase() ||
      (await reserveIdentifier(prisma, {
        companyId,
        entity: "CAR_SALES_PAYMENT",
      }));

    const created = await prisma.$transaction(async (tx) => {
      const payment = await tx.carSalesPayment.create({
        data: {
          companyId,
          paymentNo,
          dealId: validated.dealId,
          paymentDate: new Date(validated.paymentDate),
          paymentMethod: validated.paymentMethod,
          amount: validated.amount,
          reference: validated.reference?.trim() || null,
          notes: validated.notes?.trim() || null,
          receivedById: session.user.id,
        },
      });

      const nextPaid = deal.paidAmount + validated.amount;
      const nextBalance = Math.max(deal.netAmount - nextPaid, 0);
      const nextStatus =
        nextBalance <= 0
          ? deal.status === "CONTRACTED"
            ? "DELIVERY_READY"
            : deal.status
          : deal.status;

      await tx.carSalesDeal.update({
        where: { id: deal.id },
        data: {
          paidAmount: nextPaid,
          balanceAmount: nextBalance,
          status: nextStatus,
        },
      });

      return tx.carSalesPayment.findUnique({
        where: { id: payment.id },
        include: {
          deal: {
            select: {
              id: true,
              dealNo: true,
              customerName: true,
              status: true,
              netAmount: true,
              paidAmount: true,
              balanceAmount: true,
            },
          },
          receivedBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Payment number already exists", 409);
    }
    console.error("[API] POST /api/v2/autos/financing error:", error);
    return errorResponse("Failed to create deal payment");
  }
}
