import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, validateSession } from "@/lib/api-utils";
import { enqueueDocumentRenderJob, renderDocumentSync } from "@/lib/documents/service";
import { hasFeature } from "@/lib/platform/features";
import type { DocumentRenderRequest } from "@/lib/documents/service";

export const runtime = "nodejs";

function resolveFeatureKey(sourceKey: string): string | null {
  if (sourceKey === "reports.shift") return "reports.shift";
  if (sourceKey === "reports.attendance") return "reports.attendance";
  if (sourceKey === "reports.plant") return "reports.plant";
  if (sourceKey === "dashboard.executive-summary") return "reports.dashboard";
  if (sourceKey === "accounting.sales.invoice") return "accounting.ar";
  if (sourceKey === "accounting.sales.quotation") return "accounting.ar";
  if (sourceKey === "accounting.sales.receipt") return "accounting.ar";
  return null;
}

const requestSchema = z.object({
  target: z.enum(["LIST", "RECORD", "DASHBOARD"]),
  sourceKey: z.string().min(1),
  format: z.enum(["pdf", "csv"]).default("pdf"),
  mode: z.enum(["SYNC", "ASYNC"]).optional(),
  recordId: z.string().uuid().optional(),
  filters: z.record(z.string(), z.string()).optional(),
  payload: z.unknown().optional(),
  templateId: z.string().uuid().optional(),
  templateVersionId: z.string().uuid().optional(),
  idempotencyKey: z.string().max(120).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const input = requestSchema.parse(body);
    const typedInput = input as unknown as DocumentRenderRequest;

    const featureKey = resolveFeatureKey(typedInput.sourceKey);
    if (featureKey) {
      const enabled = await hasFeature(session.user.companyId, featureKey);
      if (!enabled) {
        return errorResponse("Feature disabled for this export source", 403, { featureKey });
      }
    }

    const queued = await enqueueDocumentRenderJob(session.user.companyId, session.user.id, typedInput);
    if (queued.mode === "ASYNC") {
      return NextResponse.json({
        mode: "ASYNC",
        jobId: queued.jobId,
        status: queued.status,
        reused: queued.reused,
      });
    }

    const rendered = await renderDocumentSync(session.user.companyId, typedInput);

    const bodyBuffer = new Uint8Array(rendered.data);
    return new Response(bodyBuffer, {
      headers: {
        "Content-Type": rendered.contentType,
        "Content-Disposition": `attachment; filename="${rendered.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }

    console.error("[API] POST /api/documents/render error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to render document", 500);
  }
}
