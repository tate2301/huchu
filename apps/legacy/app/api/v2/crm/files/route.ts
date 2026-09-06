import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { fileOwnerSchema, recordFileSchema } from "@/lib/crm/record-files";
import { subjectData, subjectFromFileOwner, subjectWhere } from "@/lib/records/subject";

/**
 * Files on a record.
 *
 * The upload itself goes to /api/v2/crm/uploads, which puts the bytes in blob
 * storage and hands back a url. This records that the url belongs to a
 * record — two steps rather than one because an upload that succeeds and a
 * row that fails should leave a file nobody can see, not a row pointing at
 * nothing.
 *
 * Scoped by companyId on every query. The owner id arrives from the client,
 * so the company filter is what stops a valid uuid from another tenant
 * returning that tenant's files.
 */

const LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = fileOwnerSchema.safeParse({
      owner: searchParams.get("owner"),
      ownerId: searchParams.get("ownerId"),
    });
    if (!parsed.success) return errorResponse("Which record?", 400);

    const subject = subjectFromFileOwner(parsed.data.owner, parsed.data.ownerId);
    if (!subject) return errorResponse("Which record?", 400);

    const files = await prisma.crmRecordFile.findMany({
      where: {
        companyId: session.user.companyId,
        // S-4.2 — matches a file filed under either scheme, so this keeps
        // working before the backfill has run and after the columns go.
        ...subjectWhere("file", subject),
      },
      select: {
        id: true,
        name: true,
        url: true,
        size: true,
        contentType: true,
        note: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    });

    return successResponse({ data: files });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/files error:", error);
    return errorResponse("Failed to load the files");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = recordFileSchema.parse(await request.json());

    const writeSubject = subjectFromFileOwner(body.owner, body.ownerId);
    if (!writeSubject) return errorResponse("Which record?", 400);

    const created = await prisma.crmRecordFile.create({
      data: {
        companyId: session.user.companyId,
        name: body.name,
        url: body.url,
        size: body.size ?? null,
        contentType: body.contentType ?? null,
        note: body.note ?? null,
        uploadedById: session.user.id,
        // Dual-write: the pair always, and the legacy column too when this kind
        // has one, so a rollback of this change loses nothing.
        ...subjectData("file", writeSubject),
      },
      select: {
        id: true,
        name: true,
        url: true,
        size: true,
        contentType: true,
        note: true,
        createdAt: true,
        uploadedBy: { select: { id: true, name: true } },
      },
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    // A foreign key that does not resolve means the record is not this
    // company's — or does not exist. Both are "not found" to the caller.
    console.error("[API] POST /api/v2/crm/files error:", error);
    return errorResponse("Couldn't attach that file");
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

export async function DELETE(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = deleteSchema.safeParse({ id: searchParams.get("id") });
    if (!parsed.success) return errorResponse("Which file?", 400);

    // deleteMany rather than delete: scoped by company in the same statement,
    // so another tenant's id deletes nothing rather than throwing a 500 that
    // confirms the row exists.
    const result = await prisma.crmRecordFile.deleteMany({
      where: { id: parsed.data.id, companyId: session.user.companyId },
    });
    if (result.count === 0) return errorResponse("File not found", 404);

    return successResponse({ id: parsed.data.id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/crm/files error:", error);
    return errorResponse("Failed to remove the file");
  }
}
