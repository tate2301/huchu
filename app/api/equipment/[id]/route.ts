import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const equipmentUpdateSchema = z
  .object({
    equipmentCode: z.string().min(1).max(50).optional(),
    name: z.string().min(1).max(200).optional(),
    category: z.enum(["CRUSHER", "MILL", "PUMP", "GENERATOR", "VEHICLE", "OTHER"]).optional(),
    siteId: z.string().uuid().optional(),
    locationId: z.string().uuid().optional(),
    numberOfItems: z.number().int().min(1).optional(),
    lastServiceDate: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .optional(),
    nextServiceDue: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .optional(),
    serviceHours: z.number().int().min(0).optional(),
    serviceDays: z.number().int().min(0).optional(),
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

    const equipment = await prisma.equipment.findUnique({
      where: { id },
      include: {
        site: { select: { name: true, code: true, companyId: true } },
        location: { select: { id: true, code: true, name: true } },
      },
    })

    if (!equipment) {
      return errorResponse("Equipment not found", 404)
    }

    if (equipment.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    return successResponse(equipment)
  } catch (error) {
    console.error("[API] GET /api/equipment/[id] error:", error)
    return errorResponse("Failed to fetch equipment")
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
    const validated = equipmentUpdateSchema.parse(body)

    if (validated.equipmentCode !== undefined) {
      return errorResponse("Equipment code is immutable and cannot be changed", 400)
    }

    const existing = await prisma.equipment.findUnique({
      where: { id },
      include: { site: { select: { companyId: true, isActive: true } } },
    })

    if (!existing) {
      return errorResponse("Equipment not found", 404)
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    const targetSiteId = validated.siteId ?? existing.siteId
    const targetCode = existing.equipmentCode

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

    if (validated.siteId) {
      const duplicate = await prisma.equipment.findFirst({
        where: {
          id: { not: id },
          equipmentCode: targetCode,
          siteId: targetSiteId,
        },
        select: { id: true },
      })

      if (duplicate) {
        return errorResponse("Equipment code already exists for this site", 409)
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

    const equipment = await prisma.equipment.update({
      where: { id },
      data: {
        name: validated.name,
        category: validated.category,
        siteId: validated.siteId,
        locationId: validated.locationId,
        numberOfItems: validated.numberOfItems,
        serviceHours: validated.serviceHours,
        serviceDays: validated.serviceDays,
        isActive: validated.isActive,
        lastServiceDate: validated.lastServiceDate
          ? new Date(validated.lastServiceDate)
          : undefined,
        nextServiceDue: validated.nextServiceDue
          ? new Date(validated.nextServiceDue)
          : undefined,
      },
      include: {
        site: { select: { name: true, code: true } },
        location: { select: { id: true, code: true, name: true } },
      },
    })

    return successResponse(equipment)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/equipment/[id] error:", error)
    return errorResponse("Failed to update equipment")
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

    const existing = await prisma.equipment.findUnique({
      where: { id },
      include: { site: { select: { companyId: true } } },
    })

    if (!existing) {
      return errorResponse("Equipment not found", 404)
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    const workOrders = await prisma.workOrder.count({
      where: { equipmentId: id },
    })

    if (workOrders > 0) {
      return errorResponse(
        "Equipment has linked work orders and cannot be deleted. Deactivate instead.",
        409,
      )
    }

    await prisma.equipment.delete({ where: { id } })
    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/equipment/[id] error:", error)
    return errorResponse("Failed to delete equipment")
  }
}
