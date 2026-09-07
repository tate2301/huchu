import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { recordSubjectSchema, subjectData, subjectWhere } from "../../../../subject";

import { guardRecordSubject } from "../../../../subject-guard";

/**
 * Files on a record — any record, in any module.
 *
 * The same table and the same storage as `/api/v2/crm/files`; what differs is the
 * door. That route is gated on `crm.core` by URL prefix, so a school could not
 * reach it however well the storage supported a student. This one gates per
 * subject type — see `../_guard.ts`.
 *
 * The upload itself still goes to `/api/v2/crm/uploads`, which puts the bytes in
 * blob storage and returns a url; this records that the url belongs to a record.
 * Two steps rather than one, because an upload that succeeds and a row that fails
 * should leave a file nobody can see rather than a row pointing at nothing.
 *
 * Scoped by companyId on every query. The subject id arrives from the client, so
 * the company filter is what stops a valid uuid from another tenant returning
 * that tenant's files.
 */

const LIMIT = 100;

const FILE_SELECT = {
  id: true,
  name: true,
  url: true,
  size: true,
  contentType: true,
  note: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const;

const createFileSchema = recordSubjectSchema.extend({
  name: z.string().trim().min(1).max(300),
  url: z.string().trim().url().max(2000),
  size: z.number().int().min(0).max(2_000_000_000).nullish(),
  contentType: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(500).nullish(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const parsed = recordSubjectSchema.safeParse({
      subjectType: searchParams.get("subjectType"),
      subjectId: searchParams.get("subjectId"),
    });
    if (!parsed.success) return errorResponse("Which record?", 400);

    const subject = { type: parsed.data.subjectType, id: parsed.data.subjectId };
    const guard = await guardRecordSubject(session, subject.type, "view");
    if (!guard.ok) return errorResponse(guard.message, guard.status);

    const files = await prisma.crmRecordFile.findMany({
      where: {
        companyId: session.user.companyId,
        ...subjectWhere("file", subject),
      },
      select: FILE_SELECT,
      orderBy: { createdAt: "desc" },
      take: LIMIT,
    });

    return successResponse({ data: files });
  } catch (error) {
    console.error("[API] GET /api/v2/records/files error:", error);
    return errorResponse("Failed to load the files");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const data = createFileSchema.parse(await request.json());
    const subject = { type: data.subjectType, id: data.subjectId };

    const guard = await guardRecordSubject(session, subject.type, "create");
    if (!guard.ok) return errorResponse(guard.message, guard.status);

    const created = await prisma.crmRecordFile.create({
      data: {
        companyId: session.user.companyId,
        name: data.name,
        url: data.url,
        size: data.size ?? null,
        contentType: data.contentType ?? null,
        note: data.note ?? null,
        uploadedById: session.user.id,
        ...subjectData("file", subject),
      },
      select: FILE_SELECT,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/v2/records/files error:", error);
    return errorResponse("Failed to attach the file");
  }
}
