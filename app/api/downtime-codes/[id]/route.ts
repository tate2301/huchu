import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"

const updateDowntimeCodeSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    description: z.string().trim().min(1).max(300).optional(),
    siteId: z.string().uuid().nullable().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No fields provided" })

const codeSelect = {
  id: true,
  code: true,
  description: true,
  siteId: true,
  sortOrder: true,
  isActive: true,
  site: {
    select: {
      id: true,
      name: true,
      code: true,
      companyId: true,
    },
  },
} as const

function isGlobalCode(code: { siteId: string | null }) {
  return code.siteId === null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const code = await prisma.downtimeCode.findUnique({
      where: { id },
      select: codeSelect,
    })
    if (!code) {
      return errorResponse("Downtime code not found", 404)
    }

    if (code.siteId && code.site?.companyId !== session.user.companyId) {
      return errorResponse("Downtime code not found", 404)
    }

    return successResponse(code)
  } catch (error) {
    console.error("[API] GET /api/downtime-codes/[id] error:", error)
    return errorResponse("Failed to fetch downtime code")
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
      return errorResponse("Insufficient permissions to update downtime codes", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateDowntimeCodeSchema.parse(body)

    if (validated.code !== undefined) {
      return errorResponse("Downtime code is immutable and cannot be changed", 400)
    }

    const existing = await prisma.downtimeCode.findUnique({
      where: { id },
      select: codeSelect,
    })
    if (!existing) {
      return errorResponse("Downtime code not found", 404)
    }
    if (existing.siteId && existing.site?.companyId !== session.user.companyId) {
      return errorResponse("Downtime code not found", 404)
    }

    if (isGlobalCode(existing) && session.user.role !== "SUPERADMIN") {
      return errorResponse("Global downtime codes can only be edited by superadmin", 403)
    }

    if (validated.siteId !== undefined && validated.siteId !== null) {
      const targetSite = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true },
      })
      if (!targetSite || targetSite.companyId !== session.user.companyId) {
        return errorResponse("Invalid site", 403)
      }
    }

    if (validated.siteId === null && session.user.role !== "SUPERADMIN") {
      return errorResponse("Only superadmin can assign global downtime codes", 403)
    }

    const updated = await prisma.downtimeCode.update({
      where: { id },
      data: {
        description: validated.description,
        siteId: validated.siteId,
        sortOrder: validated.sortOrder,
        isActive: validated.isActive,
      },
      select: codeSelect,
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/downtime-codes/[id] error:", error)
    return errorResponse("Failed to update downtime code")
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
      return errorResponse("Insufficient permissions to archive downtime codes", 403)
    }

    const { id } = await params

    const existing = await prisma.downtimeCode.findUnique({
      where: { id },
      select: codeSelect,
    })
    if (!existing) {
      return errorResponse("Downtime code not found", 404)
    }
    if (existing.siteId && existing.site?.companyId !== session.user.companyId) {
      return errorResponse("Downtime code not found", 404)
    }

    if (isGlobalCode(existing) && session.user.role !== "SUPERADMIN") {
      return errorResponse("Global downtime codes can only be archived by superadmin", 403)
    }

    if (!existing.isActive) {
      return successResponse({ success: true, archived: true })
    }

    await prisma.downtimeCode.update({
      where: { id },
      data: { isActive: false },
    })

    return successResponse({ success: true, archived: true })
  } catch (error) {
    console.error("[API] DELETE /api/downtime-codes/[id] error:", error)
    return errorResponse("Failed to archive downtime code")
  }
}
