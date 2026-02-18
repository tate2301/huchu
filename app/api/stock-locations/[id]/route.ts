import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const stockLocationUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields provided",
  })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { id } = await params

    const location = await prisma.stockLocation.findFirst({
      where: {
        id,
        site: { companyId: session.user.companyId },
      },
      select: {
        id: true,
        code: true,
        name: true,
        siteId: true,
        isActive: true,
        site: { select: { name: true, code: true } },
      },
    })

    if (!location) {
      return errorResponse("Stock location not found", 404)
    }

    return successResponse(location)
  } catch (error) {
    console.error("[API] GET /api/stock-locations/[id] error:", error)
    return errorResponse("Failed to fetch stock location")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { id } = await params
    const body = await request.json()
    const validated = stockLocationUpdateSchema.parse(body)

    const existing = await prisma.stockLocation.findFirst({
      where: {
        id,
        site: { companyId: session.user.companyId },
      },
      select: { id: true, siteId: true, name: true },
    })

    if (!existing) {
      return errorResponse("Stock location not found", 404)
    }

    if (validated.name && validated.name !== existing.name) {
      const duplicate = await prisma.stockLocation.findFirst({
        where: {
          siteId: existing.siteId,
          name: { equals: validated.name, mode: "insensitive" },
          NOT: { id },
        },
        select: { id: true },
      })

      if (duplicate) {
        return errorResponse("Stock location already exists for this site", 409)
      }
    }

    const location = await prisma.stockLocation.update({
      where: { id },
      data: validated,
      select: {
        id: true,
        code: true,
        name: true,
        siteId: true,
        isActive: true,
        site: { select: { name: true, code: true } },
      },
    })

    return successResponse(location)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/stock-locations/[id] error:", error)
    return errorResponse("Failed to update stock location")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { id } = await params

    const existing = await prisma.stockLocation.findFirst({
      where: {
        id,
        site: { companyId: session.user.companyId },
      },
      select: { id: true },
    })

    if (!existing) {
      return errorResponse("Stock location not found", 404)
    }

    const itemCount = await prisma.inventoryItem.count({
      where: { locationId: id },
    })

    if (itemCount > 0) {
      return errorResponse(
        "Stock location has inventory items and cannot be deleted.",
        409,
      )
    }

    await prisma.stockLocation.delete({ where: { id } })

    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/stock-locations/[id] error:", error)
    return errorResponse("Failed to delete stock location")
  }
}
