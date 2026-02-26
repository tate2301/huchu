import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { processNextDocumentRenderJob } from "@/lib/documents/service";

function canRunWorker(role: string) {
  return role === "SUPERADMIN" || role === "MANAGER";
}

export const runtime = "nodejs";
export const maxDuration = 300;

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization) return false;
  return authorization === `Bearer ${expectedSecret}`;
}

function parseBatchLimit(request: NextRequest): number {
  const defaultLimit = Number(process.env.PDF_CRON_BATCH_LIMIT ?? 5);
  const { searchParams } = new URL(request.url);
  const requested = Number(searchParams.get("limit") ?? defaultLimit);
  if (!Number.isFinite(requested)) return 5;
  return Math.max(1, Math.min(25, Math.floor(requested)));
}

async function runProcessor(request: NextRequest) {
  const cronAuthorized = isAuthorizedCronRequest(request);

  if (!cronAuthorized) {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canRunWorker(session.user.role)) {
      return errorResponse("Only SUPERADMIN and MANAGER can process render jobs", 403);
    }
  }

  const limit = parseBatchLimit(request);
  const results = [];
  for (let index = 0; index < limit; index += 1) {
    const result = await processNextDocumentRenderJob();
    results.push(result);
    if (!result.processed) break;
  }

  const processedCount = results.filter((row) => row.processed).length;
  const failedCount = results.filter((row) => "status" in row && row.status === "FAILED").length;
  const last = results.at(-1);

  return successResponse({
    mode: cronAuthorized ? "cron" : "manual",
    limit,
    processedCount,
    failedCount,
    stopReason: last && !last.processed && "reason" in last ? last.reason : null,
    results,
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
