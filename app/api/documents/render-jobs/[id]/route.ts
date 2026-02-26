import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = await context.params;

    const job = await prisma.documentRenderJob.findUnique({
      where: { id: params.id },
      include: {
        artifact: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            blobUrl: true,
            byteSize: true,
            createdAt: true,
          },
        },
        template: {
          select: {
            id: true,
            name: true,
            sourceKey: true,
            documentType: true,
            targetType: true,
          },
        },
      },
    });

    if (!job || job.companyId !== session.user.companyId) {
      return errorResponse("Render job not found", 404);
    }

    return successResponse(job);
  } catch (error) {
    console.error("[API] GET /api/documents/render-jobs/[id] error:", error);
    return errorResponse("Failed to fetch render job", 500);
  }
}
