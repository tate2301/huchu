import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { money, sumMoney } from "@/lib/schools/money";

/**
 * One fee sheet: read it, rewrite it, retire it.
 *
 * The list route could create a structure and the clone route could copy one,
 * and between them there was no way to change a levy, promote a draft the clone
 * had just made, or take last year's sheet out of the picker. A school with
 * sixteen year groups accumulated sixteen more drafts every term and could
 * reach none of them.
 *
 * Two decisions worth stating:
 *
 * **Lines are replaced wholesale, not patched.** A fee sheet is read as a
 * document — six lines that add to a term's charge — and a caller that sends
 * five is saying the sixth is gone. Diffing by `feeCode` would make deleting a
 * line impossible without a second verb.
 *
 * **A structure with invoices against it is archived, never deleted.** The
 * bills quote it, and `SchoolFeeInvoice.feeStructureId` is what answers "what
 * was this family charged under". DELETE therefore refuses and names archiving
 * as the way out rather than cascading.
 */

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Which audit event a status change writes.
 *
 * Spelled out rather than built from the enum value, so the audit vocabulary
 * stays a closed set somebody can grep for. Composing the string meant the
 * event type was whatever the enum happened to say, and adding a status would
 * silently start writing a name no reader was looking for.
 */
const STRUCTURE_STATUS_EVENT = {
  DRAFT: "schools.fee.structure.edited",
  ACTIVE: "schools.fee.structure.active",
  ARCHIVED: "schools.fee.structure.archived",
} as const;

const structureLineSchema = z.object({
  feeCode: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(200),
  amount: z.number().finite().min(0),
  isMandatory: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    currency: z.string().trim().min(1).max(10).optional(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    lines: z.array(structureLineSchema).min(1).optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to change",
  );

const structureInclude = {
  term: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, code: true, name: true } },
  lines: { orderBy: [{ sortOrder: "asc" as const }, { feeCode: "asc" as const }] },
  _count: { select: { lines: true, invoices: true } },
};

/**
 * The two figures every fee-sheet row shows.
 *
 * Post S-2.1 Float→Decimal: `line.amount` is a `Prisma.Decimal` and stays one
 * through the sum; `successResponse` turns it back into a number on the way
 * out, exactly as the list route does.
 */
function totalsFor(lines: Array<{ amount: Prisma.Decimal; isMandatory: boolean }>) {
  return {
    amount: sumMoney(lines.map((line) => line.amount)),
    mandatoryAmount: sumMoney(
      lines.filter((line) => line.isMandatory).map((line) => line.amount),
    ),
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    const structure = await prisma.schoolFeeStructure.findFirst({
      where: { id, companyId: session.user.companyId },
      include: structureInclude,
    });
    if (!structure) return errorResponse("Fee structure not found", 404);

    return successResponse({ ...structure, totals: totalsFor(structure.lines) });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/fees/structures/[id] error:", error);
    return errorResponse("Failed to fetch fee structure");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const body = await request.json();
    const validated = patchSchema.parse(body);

    const existing = await prisma.schoolFeeStructure.findFirst({
      where: { id, companyId },
      include: { _count: { select: { invoices: true } } },
    });
    if (!existing) return errorResponse("Fee structure not found", 404);

    // Repricing a sheet that bills have already been raised against would make
    // the sheet and the bills disagree about what was charged. The invoices
    // keep their own copy of every line, so the past is safe either way — but a
    // bursar reading the sheet afterwards would be reading the wrong number.
    if (validated.lines && existing._count.invoices > 0) {
      return errorResponse(
        "Invoices have been raised against this sheet. Copy it to a new one rather than repricing it.",
        400,
      );
    }
    if (validated.currency && existing._count.invoices > 0) {
      return errorResponse(
        "Invoices have been raised against this sheet, so its currency is fixed",
        400,
      );
    }

    if (validated.lines) {
      const codes = validated.lines.map((line) => line.feeCode.trim().toUpperCase());
      if (new Set(codes).size !== codes.length) {
        return errorResponse("Duplicate fee codes in fee structure lines are not allowed", 400);
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.schoolFeeStructure.update({
        where: { id: existing.id },
        data: {
          ...(validated.name !== undefined ? { name: validated.name } : {}),
          ...(validated.currency !== undefined ? { currency: validated.currency } : {}),
          ...(validated.status !== undefined ? { status: validated.status } : {}),
          ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
        },
      });

      if (validated.lines) {
        await tx.schoolFeeStructureLine.deleteMany({
          where: { companyId, feeStructureId: existing.id },
        });
        await tx.schoolFeeStructureLine.createMany({
          data: validated.lines.map((line, index) => ({
            companyId,
            feeStructureId: existing.id,
            feeCode: line.feeCode.trim().toUpperCase(),
            description: line.description,
            amount: money(line.amount),
            isMandatory: line.isMandatory ?? true,
            sortOrder: line.sortOrder ?? index,
          })),
        });
      }

      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType:
          validated.status && validated.status !== existing.status
            ? STRUCTURE_STATUS_EVENT[validated.status]
            : "schools.fee.structure.edited",
        entityType: "SchoolFeeStructure",
        entityId: existing.id,
        payload: {
          name: validated.name ?? existing.name,
          termId: existing.termId,
          classId: existing.classId,
          statusBefore: existing.status,
          statusAfter: validated.status ?? existing.status,
          linesReplaced: validated.lines?.length ?? null,
        },
      });

      return tx.schoolFeeStructure.findUnique({
        where: { id: existing.id },
        include: structureInclude,
      });
    });

    if (!updated) return errorResponse("Fee structure not found", 404);
    return successResponse({ ...updated, totals: totalsFor(updated.lines) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/fees/structures/[id] error:", error);
    return errorResponse("Failed to update fee structure");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Deleting a fee sheet outright is an administrator's act, not a bursar's:
    // it is the only verb here that removes the record rather than retiring it.
    // A bursar archives instead, which is the `edit` above.
    const denied = schoolPermissionDenial(session, "schools.fees", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.schoolFeeStructure.findFirst({
      where: { id, companyId },
      include: { _count: { select: { invoices: true } } },
    });
    if (!existing) return errorResponse("Fee structure not found", 404);
    if (existing._count.invoices > 0) {
      return errorResponse(
        "Invoices quote this fee sheet. Archive it instead — deleting it would leave those bills unexplained.",
        400,
      );
    }

    await prisma.$transaction(async (tx) => {
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.structure.deleted",
        entityType: "SchoolFeeStructure",
        entityId: existing.id,
        payload: {
          name: existing.name,
          termId: existing.termId,
          classId: existing.classId,
          status: existing.status,
        },
      });
      await tx.schoolFeeStructure.delete({ where: { id: existing.id } });
    });

    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/fees/structures/[id] error:", error);
    return errorResponse("Failed to delete fee structure");
  }
}
