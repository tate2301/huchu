import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const inventoryItemUpdateSchema = z
  .object({
    itemCode: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(200).optional(),
    category: z.enum(["FUEL", "SPARES", "CONSUMABLES", "PPE", "REAGENTS", "OTHER"]).optional(),
    siteId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    unit: z.string().min(1).max(20).optional(),
    currentStock: z.number().min(0).optional(),
    minStock: z.number().min(0).optional(),
    maxStock: z.number().min(0).optional(),
    unitCost: z.number().min(0).optional(),
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

    const item = await prisma.inventoryItem.findUnique({
      where: { id },
      include: { site: { select: { name: true, code: true, companyId: true } } },
    })

    if (!item) {
      return errorResponse("Inventory item not found", 404)
    }

    if (item.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    return successResponse(item)
  } catch (error) {
    console.error("[API] GET /api/inventory/items/[id] error:", error)
    return errorResponse("Failed to fetch inventory item")
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
    const validated = inventoryItemUpdateSchema.parse(body)

    const existing = await prisma.inventoryItem.findUnique({
      where: { id },
      include: { site: { select: { companyId: true, isActive: true } } },
    })

    if (!existing) {
      return errorResponse("Inventory item not found", 404)
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    const targetSiteId = validated.siteId ?? existing.siteId
    const targetCode = validated.itemCode ?? existing.itemCode
    const minStock =
      validated.minStock === undefined ? existing.minStock : validated.minStock
    const maxStock =
      validated.maxStock === undefined ? existing.maxStock : validated.maxStock

    if (minStock !== null && maxStock !== null && minStock !== undefined && maxStock !== undefined) {
      if (minStock > maxStock) {
        return errorResponse("minStock must be less than or equal to maxStock", 400)
      }
    }

    if (validated.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true, isActive: true },
      })

      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }

      if (!site.isActive) {
        return errorResponse("Site is not active", 400)
      }
    }

    if (validated.locationId || validated.siteId) {
      const location = await prisma.stockLocation.findUnique({
        where: { id: validated.locationId ?? existing.locationId },
        select: { siteId: true, isActive: true },
      })

      if (!location || location.siteId !== targetSiteId || !location.isActive) {
        return errorResponse("Invalid stock location for site", 400)
      }
    }

    if (validated.itemCode || validated.siteId) {
      const duplicate = await prisma.inventoryItem.findFirst({
        where: {
          id: { not: id },
          itemCode: targetCode,
          siteId: targetSiteId,
        },
        select: { id: true },
      })

      if (duplicate) {
        return errorResponse("Item code already exists for this site", 409)
      }
    }

    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        itemCode: validated.itemCode,
        name: validated.name,
        category: validated.category,
        siteId: validated.siteId,
        locationId: validated.locationId,
        unit: validated.unit,
        currentStock: validated.currentStock,
        minStock: validated.minStock,
        maxStock: validated.maxStock,
        unitCost: validated.unitCost,
      },
      include: {
        site: { select: { name: true, code: true } },
        location: { select: { name: true } },
      },
    })

    return successResponse(item)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/inventory/items/[id] error:", error)
    return errorResponse("Failed to update inventory item")
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

    const existing = await prisma.inventoryItem.findUnique({
      where: { id },
      include: { site: { select: { companyId: true } } },
    })

    if (!existing) {
      return errorResponse("Inventory item not found", 404)
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    const movements = await prisma.stockMovement.count({
      where: { itemId: id },
    })

    if (movements > 0) {
      return errorResponse(
        "Inventory item has stock movements and cannot be deleted.",
        409,
      )
    }

    await prisma.inventoryItem.delete({ where: { id } })
    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/inventory/items/[id] error:", error)
    return errorResponse("Failed to delete inventory item")
  }
}
