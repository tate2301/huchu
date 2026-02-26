import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { processNextDocumentRenderJob } from "@/lib/documents/service";

function canRunWorker(role: string) {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canRunWorker(session.user.role)) {
      return errorResponse("Only SUPERADMIN and MANAGER can process render jobs", 403);
    }

    const result = await processNextDocumentRenderJob();
    return successResponse(result);
  } catch (error) {
    console.error("[API] POST /api/documents/render-jobs/process error:", error);
    return errorResponse("Failed to process render jobs", 500);
  }
}
