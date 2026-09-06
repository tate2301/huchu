import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { processDocumentRenderJobsBatch } from "@/lib/documents/service";

function canRunWorker(role: string) {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export const runtime = "nodejs";
export const maxDuration = 300;

function parseBatchLimit(request: NextRequest): number {
  const defaultLimit = Number(process.env.PDF_INLINE_BATCH_LIMIT ?? 5);
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("limit") ?? defaultLimit);
  if (!Number.isFinite(requested)) return 5;
  return Math.max(1, Math.min(25, Math.floor(requested)));
}

async function runProcessor(request: NextRequest) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) return sessionResult;
  const { session } = sessionResult;

  if (!canRunWorker(session.user.role)) {
    return errorResponse("Only SUPERADMIN and MANAGER can process render jobs", 403);
  }

  const limit = parseBatchLimit(request);
  const batch = await processDocumentRenderJobsBatch(limit);

  return successResponse({
    mode: "manual",
    ...batch,
  });
}

export async function POST(request: NextRequest) {
  try {
    return runProcessor(request);
  } catch (error) {
    console.error("[API] POST /api/documents/render-jobs/process error:", error);
    return errorResponse("Failed to process render jobs", 500);
  }
}

export async function GET(request: NextRequest) {
  try {
    return runProcessor(request);
  } catch (error) {
    console.error("[API] GET /api/documents/render-jobs/process error:", error);
    return errorResponse("Failed to process render jobs", 500);
  }
}
