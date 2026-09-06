import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { SCHOOL_IMPORT_HANDLERS } from "@corelithzw/module-campus/import/registry";

import { importPermissionDenial } from "../_guard";

const patchSchema = z.object({
  /** field key -> column header. Replaces the mapping wholesale. */
  mapping: z.record(z.string(), z.string()).optional(),
  onDuplicate: z.enum(["SKIP", "UPDATE"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

async function loadJob(companyId: string, id: string) {
  return prisma.schoolImportJob.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      entityType: true,
      status: true,
      fileName: true,
      headers: true,
      mapping: true,
      onDuplicate: true,
      notes: true,
      rowsTotal: true,
      rowsCreated: true,
      rowsUpdated: true,
      rowsSkipped: true,
      rowsFailed: true,
      createdAt: true,
      committedAt: true,
      rolledBackAt: true,
      uploadedBy: { select: { id: true, name: true, email: true } },
    },
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await context.params;
    const job = await loadJob(session.user.companyId, id);
    if (!job) return errorResponse("Import not found", 404);

    const denied = importPermissionDenial(session, job.entityType, "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    // The rejected rows are what a registrar opens this for, so they are the
    // default view rather than something to filter down to.
    const onlyProblems = searchParams.get("problems") !== "false";

    const rows = await prisma.schoolImportRow.findMany({
      where: {
        jobId: job.id,
        ...(onlyProblems
          ? {
              OR: [
                { status: { in: ["FAILED", "ANOMALY", "SKIPPED"] } },
                { NOT: { issuesJson: { equals: [] } } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        lineNo: true,
        status: true,
        valuesJson: true,
        issuesJson: true,
        matchLabel: true,
        parserWarning: true,
        errorMessage: true,
      },
      orderBy: { lineNo: "asc" },
      take: 500,
    });

    return successResponse({
      ...job,
      fields: SCHOOL_IMPORT_HANDLERS[job.entityType].fields,
      naturalKey: SCHOOL_IMPORT_HANDLERS[job.entityType].naturalKey,
      rows,
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/imports/[id] error:", error);
    return errorResponse("Failed to fetch import");
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await context.params;
    const job = await loadJob(session.user.companyId, id);
    if (!job) return errorResponse("Import not found", 404);

    const denied = importPermissionDenial(session, job.entityType, "create");
    if (denied) return errorResponse(denied, 403);

    if (job.status === "COMMITTED") {
      return errorResponse("This import has already been committed", 409);
    }

    const body = await request.json();
    const validated = patchSchema.parse(body);

    const updated = await prisma.schoolImportJob.update({
      where: { id: job.id },
      data: {
        ...(validated.mapping ? { mapping: validated.mapping, status: "MAPPING" } : {}),
        ...(validated.onDuplicate ? { onDuplicate: validated.onDuplicate } : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
      },
      select: { id: true, mapping: true, onDuplicate: true, notes: true, status: true },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/imports/[id] error:", error);
    return errorResponse("Failed to update import");
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await context.params;
    const job = await loadJob(session.user.companyId, id);
    if (!job) return errorResponse("Import not found", 404);

    const denied = importPermissionDenial(session, job.entityType, "create");
    if (denied) return errorResponse(denied, 403);

    if (job.status === "COMMITTED") {
      return errorResponse(
        "This import has been committed. Roll it back before deleting it, or the record of what it did goes with it.",
        409,
      );
    }

    await prisma.schoolImportJob.delete({ where: { id: job.id } });
    return successResponse({ id: job.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/imports/[id] error:", error);
    return errorResponse("Failed to delete import");
  }
}
