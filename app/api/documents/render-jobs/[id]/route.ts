import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { canReadRenderJob } from "@/lib/documents/access";
import { processDocumentRenderJobsBatch } from "@/lib/documents/service";
import { prisma } from "@/lib/prisma";

/**
 * A render job's progress, for the person waiting on it.
 *
 * What went into the job (its filters, the ids somebody ticked) and where the
 * file is stored are not part of the answer: the file is fetched through
 * `/api/documents/artifacts/:id`, which checks who is asking every time.
 */
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
      select: {
        id: true,
        companyId: true,
        requestedById: true,
        sourceKey: true,
        status: true,
        lastError: true,
        queuedAt: true,
        startedAt: true,
        finishedAt: true,
        artifact: {
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            byteSize: true,
            createdAt: true,
            expiresAt: true,
          },
        },
      },
    });

    // 404 rather than 403 for somebody else's job: which exports exist, and
    // when, is itself something a colleague has no business reading.
    if (!job || !canReadRenderJob(session.user, job)) {
      return errorResponse("Render job not found", 404);
    }

    if (job.status === "QUEUED" || job.status === "FAILED") {
      after(async () => {
        try {
          await processDocumentRenderJobsBatch(1);
        } catch (error) {
          console.error("[API] render job status poke processing error:", error);
        }
      });
    }

    return successResponse({
      id: job.id,
      sourceKey: job.sourceKey,
      status: job.status,
      lastError: job.lastError,
      queuedAt: job.queuedAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      artifact: job.artifact,
    });
  } catch (error) {
    console.error("[API] GET /api/documents/render-jobs/[id] error:", error);
    return errorResponse("Failed to fetch render job", 500);
  }
}
