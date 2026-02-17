import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

const updateSectionSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    siteId: z.string().uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields provided" })

const sectionSelect = {
  id: true,
  name: true,
  siteId: true,
  isActive: true,
  _count: { select: { shiftReports: true } },
  site: { select: { name: true, code: true, companyId: true } },
} as const

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const section = await prisma.section.findUnique({
      where: { id },
      select: sectionSelect,
    })
    if (!section || section.site.companyId !== session.user.companyId) {
      return errorResponse("Section not found", 404)
    }

    return successResponse(section)
  } catch (error) {
    console.error("[API] GET /api/sections/[id] error:", error)
    return errorResponse("Failed to fetch section")
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

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to update sections", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateSectionSchema.parse(body)

    const existing = await prisma.section.findUnique({
      where: { id },
      select: {
        id: true,
        site: { select: { companyId: true } },
      },
    })
    if (!existing || existing.site.companyId !== session.user.companyId) {
      return errorResponse("Section not found", 404)
    }

    if (validated.siteId) {
      const targetSite = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true },
      })
      if (!targetSite || targetSite.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }
    }

    const section = await prisma.section.update({
      where: { id },
      data: {
        name: validated.name,
        siteId: validated.siteId,
        isActive: validated.isActive,
      },
      select: sectionSelect,
    })

    return successResponse(section)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/sections/[id] error:", error)
    return errorResponse("Failed to update section")
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

    if (!hasRole(session, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Insufficient permissions to archive sections", 403)
    }

    const { id } = await params

    const existing = await prisma.section.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        site: { select: { companyId: true } },
      },
    })
    if (!existing || existing.site.companyId !== session.user.companyId) {
      return errorResponse("Section not found", 404)
    }

    if (!existing.isActive) {
      return successResponse({ success: true, archived: true })
    }

    await prisma.section.update({
      where: { id },
      data: { isActive: false },
    })

    return successResponse({ success: true, archived: true })
  } catch (error) {
    console.error("[API] DELETE /api/sections/[id] error:", error)
    return errorResponse("Failed to archive section")
  }
}
