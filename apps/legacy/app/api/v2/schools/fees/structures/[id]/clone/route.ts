import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@corelithzw/module-campus/audit";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";

/**
 * Copy a fee structure to other year groups, or into the next term.
 *
 * `provisionSchool` leaves one starter structure on the first rung of the ladder
 * and its comment says "the school clones it up the years" — which nothing in the
 * product could do. A combined school has sixteen year groups; a bursar was
 * expected to hand-enter sixteen structures of identical lines, every term, and
 * the only thing standing between that and a mis-keyed levy on Form 4 was
 * concentration. That is the sort of gap that never gets filed as a bug because
 * it looks like data entry rather than a missing feature.
 *
 * Three decisions:
 *
 * **A class that already has a live structure for the target term is skipped, not
 * overwritten.** Two ACTIVE structures for one class and term is what S-2.4's
 * partial unique index exists to prevent, and a clone that silently replaced the
 * school's own edits would be worse than one that refuses.
 *
 * **Clones land as DRAFT unless asked otherwise.** Copying a fee sheet across a
 * school is a bulk change to what families owe; it should be reviewed before it
 * can be invoiced against. `status: "ACTIVE"` is available for the bursar who has
 * already reviewed the source and means it.
 *
 * **The lines are copied as `Decimal`, straight across.** No arithmetic happens
 * here at all — not even a multiplication — so there is nothing for a float to
 * spoil. A school that charges Form 4 more than Form 1 edits the clone; guessing
 * a scale factor would be inventing their fee policy for them.
 */

const cloneSchema = z.object({
  /** Where to copy it. Empty is refused rather than treated as "everywhere". */
  classIds: z.array(z.string().uuid()).min(1).max(60),
  /** Defaults to the source's own term. */
  termId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "ACTIVE"]).optional(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `edit` rather than `view`: this writes what families will be billed.
    const denied = schoolPermissionDenial(session, "schools.fees", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const body = cloneSchema.parse(await request.json());

    const source = await prisma.schoolFeeStructure.findFirst({
      where: { id, companyId },
      include: { lines: { orderBy: [{ sortOrder: "asc" }, { feeCode: "asc" }] } },
    });
    if (!source) return errorResponse("Fee structure not found", 404);
    if (source.lines.length === 0) {
      return errorResponse("This fee structure has no lines to copy", 400);
    }

    const termId = body.termId ?? source.termId;
    const status = body.status ?? "DRAFT";

    const [term, classes] = await Promise.all([
      prisma.schoolTerm.findFirst({
        where: { id: termId, companyId },
        select: { id: true, code: true, name: true },
      }),
      prisma.schoolClass.findMany({
        where: { id: { in: body.classIds }, companyId },
        select: { id: true, code: true, name: true },
        // Ordered, because this order is what a person reads. The clone loop below
        // walks these in sequence and the audit row lists the codes in the order
        // it created them — unordered, that row named the same set of year groups
        // in a different sequence each run, which is both harder to read and what
        // made `fee-structure-clone.test.ts` fail intermittently.
        orderBy: { code: "asc" },
      }),
    ]);
    if (!term) return errorResponse("Term not found", 404);
    if (classes.length === 0) return errorResponse("No matching year groups", 404);

    // What is already there. Only a live structure blocks: a DRAFT the bursar
    // abandoned should not stop them copying a corrected one over the top.
    const existing = await prisma.schoolFeeStructure.findMany({
      where: {
        companyId,
        termId,
        classId: { in: classes.map((row) => row.id) },
        status: "ACTIVE",
      },
      select: { classId: true },
    });
    const blocked = new Set(existing.map((row) => row.classId));

    const targets = classes.filter(
      (row) => !blocked.has(row.id) && row.id !== source.classId,
    );

    const skipped = classes.filter((row) => blocked.has(row.id)).map((row) => row.code);

    // One transaction, audit row inside it: sixteen structures that partly
    // landed, with a row saying all sixteen did, is the failure the audit exists
    // to prevent.
    const created = await prisma.$transaction(async (tx) => {
      const rows: Array<{ id: string; classCode: string }> = [];

      for (const target of targets) {
        const structure = await tx.schoolFeeStructure.create({
          data: {
            companyId,
            termId,
            classId: target.id,
            // Named after where it landed rather than where it came from, so a
            // list of sixteen structures is readable.
            name: `${source.name.replace(/·.*$/, "").trim()} · ${target.name}`,
            currency: source.currency,
            status,
            notes: source.notes,
            lines: {
              create: source.lines.map((line) => ({
                companyId,
                feeCode: line.feeCode,
                description: line.description,
                amount: line.amount,
                isMandatory: line.isMandatory,
                sortOrder: line.sortOrder,
              })),
            },
          },
          select: { id: true },
        });
        rows.push({ id: structure.id, classCode: target.code });
      }

      if (rows.length > 0) {
        await writeSchoolAuditEvent(tx, {
          companyId,
          actorId: session.user.id,
          eventType: "schools.fee.structure.cloned",
          entityType: "SchoolFeeStructure",
          entityId: source.id,
          payload: {
            termId,
            status,
            created: rows.map((row) => row.classCode),
            skipped,
          },
        });
      }

      return rows;
    });

    return successResponse({
      created: created.length,
      structureIds: created.map((row) => row.id),
      // Named, not counted: a bursar who asked for sixteen and got fourteen needs
      // to know which two the school had already decided for itself.
      skipped,
      term: { id: term.id, code: term.code, name: term.name },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/fees/structures/[id]/clone error:", error);
    return errorResponse("Failed to copy the fee structure");
  }
}
