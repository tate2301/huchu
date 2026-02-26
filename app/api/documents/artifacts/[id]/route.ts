import { NextRequest, NextResponse } from "next/server";
import { errorResponse, validateSession } from "@/lib/api-utils";
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

    const artifact = await prisma.documentArtifact.findUnique({
      where: { id: params.id },
      include: {
        job: {
          select: {
            companyId: true,
            status: true,
          },
        },
      },
    });

    if (!artifact || artifact.companyId !== session.user.companyId) {
      return errorResponse("Artifact not found", 404);
    }

    if (artifact.job.status !== "SUCCEEDED") {
      return errorResponse("Artifact is not ready", 409);
    }

    return NextResponse.redirect(artifact.blobUrl);
  } catch (error) {
    console.error("[API] GET /api/documents/artifacts/[id] error:", error);
    return errorResponse("Failed to fetch document artifact", 500);
  }
}
