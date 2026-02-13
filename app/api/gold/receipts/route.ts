import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const buyerReceiptSchema = z.object({
  goldDispatchId: z.string().uuid(),
  receiptDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  assayResult: z.number().min(0).optional(),
  paidAmount: z.number().min(0),
  paymentMethod: z.string().min(1).max(100),
  paymentChannel: z.string().max(100).optional(),
  paymentReference: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
})

function formatTwoDigits(value: number) {
  return String(value).padStart(2, "0")
}

function buildReceiptNumberCandidate() {
  const now = new Date()
  const datePart = `${now.getFullYear()}${formatTwoDigits(now.getMonth() + 1)}${formatTwoDigits(now.getDate())}`
  const timePart = `${formatTwoDigits(now.getHours())}${formatTwoDigits(now.getMinutes())}${formatTwoDigits(now.getSeconds())}`
  const randomPart = Math.floor(100 + Math.random() * 900)
  return `RCP-${datePart}-${timePart}-${randomPart}`
}

async function generateUniqueReceiptNumber() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = buildReceiptNumberCandidate()
    const existing = await prisma.buyerReceipt.findFirst({
      where: { receiptNumber: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
  }

  return `RCP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const siteId = searchParams.get("siteId")
    const goldDispatchId = searchParams.get("goldDispatchId")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      goldDispatch: {
        goldPour: { site: { companyId: session.user.companyId } },
      },
    }

    if (siteId) {
      where.goldDispatch = {
        ...(where.goldDispatch as Record<string, unknown>),
        goldPour: { siteId },
      }
    }

    if (goldDispatchId) where.goldDispatchId = goldDispatchId

    const [receipts, total] = await Promise.all([
      prisma.buyerReceipt.findMany({
        where,
        include: {
          goldDispatch: {
            include: {
              goldPour: {
                select: {
                  id: true,
                  pourBarId: true,
                  grossWeight: true,
                  pourDate: true,
                  site: { select: { name: true, code: true } },
                },
              },
            },
          },
        },
        orderBy: { receiptDate: "desc" },
        skip,
        take: limit,
      }),
      prisma.buyerReceipt.count({ where }),
    ])

    const normalizedReceipts = receipts.map((receipt) => ({
      ...receipt,
      goldDispatch: {
        ...receipt.goldDispatch,
        batchId: receipt.goldDispatch.goldPour.id,
        batchCode: receipt.goldDispatch.goldPour.pourBarId,
        goldPour: {
          ...receipt.goldDispatch.goldPour,
          batchId: receipt.goldDispatch.goldPour.id,
          batchCode: receipt.goldDispatch.goldPour.pourBarId,
        },
      },
    }))

    return successResponse(paginationResponse(normalizedReceipts, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/gold/receipts error:", error)
    return errorResponse("Failed to fetch buyer receipts")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = buyerReceiptSchema.parse(body)

    const dispatch = await prisma.goldDispatch.findUnique({
      where: { id: validated.goldDispatchId },
      include: {
        goldPour: { include: { site: { select: { companyId: true } } } },
      },
    })

    if (!dispatch || dispatch.goldPour.site.companyId !== session.user.companyId) {
      return errorResponse("Invalid dispatch", 403)
    }

    const existingReceipt = await prisma.buyerReceipt.findUnique({
      where: { goldDispatchId: validated.goldDispatchId },
      select: { id: true },
    })

    if (existingReceipt) {
      return errorResponse("Receipt already exists for this dispatch", 409)
    }

    const receiptNumber = await generateUniqueReceiptNumber()

    const receipt = await prisma.buyerReceipt.create({
      data: {
        goldDispatchId: validated.goldDispatchId,
        receiptNumber,
        receiptDate: new Date(validated.receiptDate),
        assayResult: validated.assayResult,
        paidAmount: validated.paidAmount,
        paymentMethod: validated.paymentMethod,
        paymentChannel: validated.paymentChannel,
        paymentReference: validated.paymentReference,
        notes: validated.notes,
      },
      include: {
        goldDispatch: {
          include: {
            goldPour: {
              select: {
                id: true,
                pourBarId: true,
                grossWeight: true,
                pourDate: true,
                site: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
    })

    return successResponse(
      {
        ...receipt,
        goldDispatch: {
          ...receipt.goldDispatch,
          batchId: receipt.goldDispatch.goldPour.id,
          batchCode: receipt.goldDispatch.goldPour.pourBarId,
          goldPour: {
            ...receipt.goldDispatch.goldPour,
            batchId: receipt.goldDispatch.goldPour.id,
            batchCode: receipt.goldDispatch.goldPour.pourBarId,
          },
        },
      },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/gold/receipts error:", error)
    return errorResponse("Failed to create buyer receipt")
  }
}
