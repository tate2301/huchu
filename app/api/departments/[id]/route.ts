import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { ensureApproverRole } from "@/lib/workflow/approvals"
import { departmentInclude, resolveDepartmentPlacement } from "@/lib/hr/departments"

const updateDepartmentSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
    // Nullish, not optional: sending `null` is how the record clears a head,
    // a cost centre or a site, and omitting the key leaves it untouched.
    headEmployeeId: z.string().uuid().nullish(),
    costCenterId: z.string().uuid().nullish(),
    siteId: z.string().uuid().nullish(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "No fields provided" })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    const record = await prisma.department.findUnique({
      where: { id },
      include: departmentInclude,
    })

    if (!record || record.companyId !== session.user.companyId) {
      return errorResponse("Department not found", 404)
    }

    return successResponse(record)
  } catch (error) {
    console.error("[API] GET /api/departments/[id] error:", error)
    return errorResponse("Failed to fetch department")
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

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to update departments", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = updateDepartmentSchema.parse(body)

    if (validated.code !== undefined) {
      return errorResponse("Department code is immutable and cannot be changed", 400)
    }

    const existing = await prisma.department.findUnique({
      where: { id },
      select: { companyId: true },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Department not found", 404)
    }

    const placement = await resolveDepartmentPlacement(session.user.companyId, {
      ...(validated.headEmployeeId === undefined
        ? {}
        : { headEmployeeId: validated.headEmployeeId }),
      ...(validated.costCenterId === undefined
        ? {}
        : { costCenterId: validated.costCenterId }),
      ...(validated.siteId === undefined ? {} : { siteId: validated.siteId }),
    })
    if (!placement.ok) return errorResponse(placement.error, 400)

    const updated = await prisma.department.update({
      where: { id },
      data: {
        name: validated.name,
        isActive: validated.isActive,
        ...placement.data,
      },
      include: departmentInclude,
    })

    return successResponse(updated)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/departments/[id] error:", error)
    return errorResponse("Failed to update department")
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

    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to delete departments", 403)
    }

    const { id } = await params

    const existing = await prisma.department.findUnique({
      where: { id },
      select: { companyId: true },
    })

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Department not found", 404)
    }

    const [linkedEmployees, linkedSections] = await Promise.all([
      prisma.employee.count({ where: { departmentId: id } }),
      prisma.section.count({ where: { departmentId: id } }),
    ])
    if (linkedEmployees > 0) {
      return errorResponse("Department has linked employees and cannot be deleted", 409)
    }
    // The foreign key is ON DELETE SET NULL, so the database would let this
    // through and quietly hand four sections back to their site with no
    // department. The same refusal the employees get, for the same reason:
    // detach them deliberately or archive the department instead.
    if (linkedSections > 0) {
      return errorResponse(
        `This department runs ${linkedSections} section${linkedSections === 1 ? "" : "s"}. Move them first, or archive the department instead.`,
        409,
      )
    }

    await prisma.department.delete({ where: { id } })

    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/departments/[id] error:", error)
    return errorResponse("Failed to delete department")
  }
}
