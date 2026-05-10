import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse, hasRole } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createCommentSchema = z.object({
  body: z.string().min(1).max(4000),
  ledgerEntryId: z.string().uuid().optional(),
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

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403)
    }

    const imp = await prisma.goldLedgerImport.findUnique({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    })
    if (!imp) return errorResponse("Import not found", 404)

    const { searchParams } = new URL(request.url)
    const ledgerEntryId = searchParams.get("ledgerEntryId") ?? undefined

    const comments = await prisma.goldLedgerImportComment.findMany({
      where: { importId: id, ledgerEntryId: ledgerEntryId ?? null },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "asc" },
    })

    return successResponse(comments)
  } catch (error) {
    console.error("[API] GET /api/gold/imports/[id]/comments error:", error)
    return errorResponse("Failed to list comments")
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const { id } = await params

    if (!hasRole(session, ["OPERATOR", "MANAGER", "SUPERADMIN"])) {
      return errorResponse("Operator-level access required", 403)
    }

    const imp = await prisma.goldLedgerImport.findUnique({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    })
    if (!imp) return errorResponse("Import not found", 404)

    const body = await request.json()
    const parsed = createCommentSchema.safeParse(body)
    if (!parsed.success) return errorResponse(parsed.error.message, 400)

    if (parsed.data.ledgerEntryId) {
      const entry = await prisma.goldLedgerEntry.findUnique({
        where: { id: parsed.data.ledgerEntryId, importId: id },
        select: { id: true },
      })
      if (!entry) return errorResponse("Ledger entry not found", 404)
    }

    const comment = await prisma.goldLedgerImportComment.create({
      data: {
        importId: id,
        ledgerEntryId: parsed.data.ledgerEntryId ?? null,
        body: parsed.data.body,
        createdById: session.user.id,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    })

    return successResponse(comment, 201)
  } catch (error) {
    console.error("[API] POST /api/gold/imports/[id]/comments error:", error)
    return errorResponse("Failed to create comment")
  }
}
