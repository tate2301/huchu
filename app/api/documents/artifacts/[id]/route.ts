import { NextRequest, NextResponse } from "next/server";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { canReadRenderJob } from "@/lib/documents/access";
import { attachmentDisposition } from "@/lib/documents/service";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * A finished export, handed to the person it was made for.
 *
 * Streamed through here rather than redirected to the stored file: a redirect
 * puts the file's own address in the browser's history, and that address
 * needs no sign-in to open.
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

    const artifact = await prisma.documentArtifact.findUnique({
      where: { id: params.id },
      include: {
        job: {
          select: {
            companyId: true,
            requestedById: true,
            status: true,
          },
        },
      },
    });

    if (!artifact || !canReadRenderJob(session.user, artifact.job)) {
      return errorResponse("Artifact not found", 404);
    }

    if (artifact.job.status !== "SUCCEEDED") {
      return errorResponse("Artifact is not ready", 409);
    }

    if (artifact.expiresAt && artifact.expiresAt < new Date()) {
      return errorResponse("This export has expired. Export the list again.", 410);
    }

    const upstream = await fetch(artifact.blobUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return errorResponse("The export file could not be read. Export the list again.", 502);
    }

    return new Response(upstream.body, {
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Disposition": attachmentDisposition(artifact.fileName),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/documents/artifacts/[id] error:", error);
    return errorResponse("Failed to fetch document artifact", 500);
  }
}
