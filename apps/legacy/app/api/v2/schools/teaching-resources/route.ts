import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getTeacherProfile } from "@/lib/schools/governance-v2";

const querySchema = z.object({
  subjectId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  /** Only what this teacher uploaded, drafts included. */
  mine: z.coerce.boolean().optional(),
});

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    description: z.string().trim().max(2000).nullish(),
    subjectId: z.string().uuid().nullish(),
    classId: z.string().uuid().nullish(),
    fileUrl: z.string().url().max(2000).nullish(),
    linkUrl: z.string().url().max(2000).nullish(),
    mimeType: z.string().trim().max(120).nullish(),
    fileSize: z.number().int().positive().nullish(),
    isShared: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.fileUrl || value.linkUrl), {
    message: "A resource needs a file or a link",
  });

const resourceSelect = {
  id: true,
  title: true,
  description: true,
  fileUrl: true,
  linkUrl: true,
  mimeType: true,
  fileSize: true,
  isShared: true,
  createdAt: true,
  subject: { select: { id: true, code: true, name: true } },
  class: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, user: { select: { name: true } } } },
};

/**
 * The staff room shelf.
 *
 * Everything shared, plus whatever the caller uploaded themselves. A teacher's
 * own unshared drafts are visible to them and to nobody else, which is what
 * makes it safe to put a half-finished worksheet here rather than on a memory
 * stick.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      subjectId: searchParams.get("subjectId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      mine: searchParams.get("mine") ?? undefined,
    });

    const profile = await getTeacherProfile(companyId, session.user.id);

    const resources = await prisma.schoolTeachingResource.findMany({
      where: {
        companyId,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.search
          ? { title: { contains: query.search, mode: "insensitive" as const } }
          : {}),
        ...(query.mine && profile
          ? { uploadedByProfileId: profile.id }
          : {
              OR: [
                { isShared: true },
                ...(profile ? [{ uploadedByProfileId: profile.id }] : []),
              ],
            }),
      },
      select: resourceSelect,
      orderBy: [{ title: "asc" }],
      take: 300,
    });

    return successResponse({ resources });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/teaching-resources error:", error);
    return errorResponse("Failed to fetch the resource shelf");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = createSchema.parse(await request.json());
    const profile = await getTeacherProfile(companyId, session.user.id);

    const created = await prisma.schoolTeachingResource.create({
      data: {
        companyId,
        title: validated.title,
        description: validated.description ?? null,
        subjectId: validated.subjectId ?? null,
        classId: validated.classId ?? null,
        fileUrl: validated.fileUrl ?? null,
        linkUrl: validated.linkUrl ?? null,
        mimeType: validated.mimeType ?? null,
        fileSize: validated.fileSize ?? null,
        isShared: validated.isShared ?? true,
        uploadedByProfileId: profile?.id ?? null,
      },
      select: resourceSelect,
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/teaching-resources error:", error);
    return errorResponse("Failed to add the resource");
  }
}
