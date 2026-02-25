import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils"
import { snapshotGoldUsdValue } from "@/lib/gold/valuation"
import { prisma } from "@/lib/prisma"
import { createJournalEntryFromSource } from "@/lib/accounting/posting"
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator"

const goldPurchaseSchema = z
  .object({
    purchaseNumber: z.string().min(1).max(50).optional(),
    purchaseDate: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
    siteId: z.string().uuid(),
    sellerType: z.enum(["EMPLOYEE", "EXTERNAL"]).default("EXTERNAL"),
    sellerEmployeeId: z.string().uuid().optional(),
    sellerName: z.string().max(200).optional(),
    sellerPhone: z.string().max(50).optional(),
    grossWeight: z.number().positive(),
    estimatedPurity: z.number().min(0).max(100).optional(),
    storageLocation: z.string().min(1).max(200),
    receiver1Id: z.string().uuid(),
    receiver2Id: z.string().uuid(),
    paidAmount: z.number().min(0),
    currency: z.string().trim().min(1).max(10).optional(),
    paymentMethod: z.string().min(1).max(100),
    paymentChannel: z.string().max(100).optional(),
    paymentReference: z.string().max(100).optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.receiver1Id === value.receiver2Id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["receiver2Id"],
        message: "Receiver 1 and Receiver 2 must be different persons",
      })
    }

    if (value.sellerType === "EMPLOYEE" && !value.sellerEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sellerEmployeeId"],
        message: "Select an employee seller",
      })
    }

    if (value.sellerType === "EXTERNAL" && value.sellerEmployeeId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["sellerEmployeeId"],
        message: "Seller employee is not allowed for external sellers",
      })
    }
  })

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const sellerType = searchParams.get("sellerType")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (siteId) where.siteId = siteId
    if (sellerType === "EMPLOYEE" || sellerType === "EXTERNAL") {
      where.sellerType = sellerType
    }

    const [purchases, total] = await Promise.all([
      prisma.goldPurchase.findMany({
        where,
        include: {
          site: { select: { id: true, name: true, code: true } },
          sellerEmployee: { select: { id: true, name: true, employeeId: true } },
          receiver1: { select: { id: true, name: true, employeeId: true } },
          receiver2: { select: { id: true, name: true, employeeId: true } },
          goldPour: {
            select: {
              id: true,
              pourBarId: true,
              pourDate: true,
              grossWeight: true,
              goldPriceUsdPerGram: true,
              valueUsd: true,
              site: { select: { name: true, code: true } },
            },
          },
        },
        orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.goldPurchase.count({ where }),
    ])

    return successResponse(paginationResponse(purchases, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/gold/purchases error:", error)
    return errorResponse("Failed to fetch gold purchases")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = goldPurchaseSchema.parse(body)

    const [site, receiver1, receiver2, employeeSeller] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { id: true, companyId: true, isActive: true },
      }),
      prisma.employee.findUnique({
        where: { id: validated.receiver1Id },
        select: { id: true, companyId: true, isActive: true, name: true },
      }),
      prisma.employee.findUnique({
        where: { id: validated.receiver2Id },
        select: { id: true, companyId: true, isActive: true, name: true },
      }),
      validated.sellerEmployeeId
        ? prisma.employee.findUnique({
            where: { id: validated.sellerEmployeeId },
            select: {
              id: true,
              companyId: true,
              isActive: true,
              name: true,
              phone: true,
            },
          })
        : Promise.resolve(null),
    ])

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse("Invalid site", 403)
    }
    if (!site.isActive) {
      return errorResponse("Site is not active", 400)
    }

    if (!receiver1 || receiver1.companyId !== session.user.companyId || !receiver1.isActive) {
      return errorResponse("Invalid receiver 1", 400)
    }
    if (!receiver2 || receiver2.companyId !== session.user.companyId || !receiver2.isActive) {
      return errorResponse("Invalid receiver 2", 400)
    }

    if (validated.sellerType === "EMPLOYEE") {
      if (!employeeSeller || employeeSeller.companyId !== session.user.companyId || !employeeSeller.isActive) {
        return errorResponse("Invalid employee seller", 400)
      }
    }

    const sellerName = (
      validated.sellerName?.trim() ||
      (validated.sellerType === "EMPLOYEE" ? employeeSeller?.name : "")
    )?.trim()
    const sellerPhone = (
      validated.sellerPhone?.trim() ||
      (validated.sellerType === "EMPLOYEE" ? employeeSeller?.phone : "")
    )?.trim()

    if (!sellerName || !sellerPhone) {
      return errorResponse("Seller name and phone are required", 400)
    }

    const purchaseNumber = validated.purchaseNumber
      ? normalizeProvidedId(validated.purchaseNumber, "GOLD_PURCHASE")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "GOLD_PURCHASE",
        })

    const existingPurchaseNumber = await prisma.goldPurchase.findFirst({
      where: {
        companyId: session.user.companyId,
        purchaseNumber,
      },
      select: { id: true },
    })

    if (existingPurchaseNumber) {
      return errorResponse("Purchase number already exists", 409)
    }

    const pourBarId = await reserveIdentifier(prisma, {
      companyId: session.user.companyId,
      entity: "GOLD_POUR",
    })

    const purchaseDate = new Date(validated.purchaseDate)
    const valuation = await snapshotGoldUsdValue({
      companyId: session.user.companyId,
      businessDate: purchaseDate,
      grams: validated.grossWeight,
    })
    if (!valuation) {
      return errorResponse("No gold price configured. Add a gold price before recording purchases.", 409)
    }

    const purchase = await prisma.$transaction(async (tx) => {
      const pour = await tx.goldPour.create({
        data: {
          siteId: validated.siteId,
          pourBarId,
          pourDate: purchaseDate,
          sourceType: "PURCHASE_PUBLIC",
          grossWeight: validated.grossWeight,
          goldPriceUsdPerGram: valuation.goldPriceUsdPerGram,
          valuationDate: valuation.valuationDate,
          valueUsd: valuation.valueUsd,
          estimatedPurity: validated.estimatedPurity,
          witness1Id: validated.receiver1Id,
          witness2Id: validated.receiver2Id,
          storageLocation: validated.storageLocation.trim(),
          notes: validated.notes?.trim() || undefined,
        },
      })

      return tx.goldPurchase.create({
        data: {
          companyId: session.user.companyId,
          siteId: validated.siteId,
          goldPourId: pour.id,
          purchaseNumber,
          purchaseDate,
          sellerType: validated.sellerType,
          sellerEmployeeId:
            validated.sellerType === "EMPLOYEE" ? validated.sellerEmployeeId : undefined,
          sellerName,
          sellerPhone,
          grossWeight: validated.grossWeight,
          estimatedPurity: validated.estimatedPurity,
          storageLocation: validated.storageLocation.trim(),
          receiver1Id: validated.receiver1Id,
          receiver2Id: validated.receiver2Id,
          paidAmount: validated.paidAmount,
          currency: validated.currency?.trim().toUpperCase() || "USD",
          paymentMethod: validated.paymentMethod.trim(),
          paymentChannel: validated.paymentChannel?.trim() || undefined,
          paymentReference: validated.paymentReference?.trim() || undefined,
          notes: validated.notes?.trim() || undefined,
          createdById: session.user.id,
        },
        include: {
          site: { select: { id: true, name: true, code: true } },
          sellerEmployee: { select: { id: true, name: true, employeeId: true } },
          receiver1: { select: { id: true, name: true, employeeId: true } },
          receiver2: { select: { id: true, name: true, employeeId: true } },
          goldPour: {
            select: {
              id: true,
              pourBarId: true,
              pourDate: true,
              grossWeight: true,
              goldPriceUsdPerGram: true,
              valueUsd: true,
              site: { select: { name: true, code: true } },
            },
          },
        },
      })
    })

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "GOLD_PURCHASE",
        sourceId: purchase.id,
        entryDate: purchase.purchaseDate,
        description: `Gold purchase ${purchase.purchaseNumber}`,
        createdById: session.user.id,
        amount: purchase.paidAmount,
        netAmount: purchase.paidAmount,
        taxAmount: 0,
        grossAmount: purchase.paidAmount,
      })
    } catch (error) {
      console.error("[Accounting] Gold purchase auto-post failed:", error)
    }

    return successResponse(purchase, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/purchases error:", error)
    return errorResponse("Failed to create gold purchase")
  }
}
