import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, validateSession } from "@corelithzw/platform/api-utils";
import {
  enqueueDocumentRenderJob,
  processDocumentRenderJobsBatch,
  renderDocumentSync,
} from "../../../service";
import { hasFeature } from "@corelithzw/platform/features";
import { documentSourceFor } from "../../../source-registry";
import type { DocumentRenderRequest } from "../../../service";

export const runtime = "nodejs";

function parseInlineBatchLimit() {
  const configured = Number(process.env.PDF_INLINE_BATCH_LIMIT ?? 2);
  if (!Number.isFinite(configured)) return 2;
  return Math.max(1, Math.min(10, Math.floor(configured)));
}

/**
 * Feature keys that may authorise an export source. A tenant needs only ONE of
 * them — sales documents are reachable from both accounting and the CRM, so a
 * CRM-only tenant must be able to render the quotation it just created. The
 * module that registered the source says which (`access`); a source nobody
 * registered has none.
 */
async function resolveFeatureKeys(sourceKey: string): Promise<string[]> {
  const access = await documentSourceFor(sourceKey)?.access?.(sourceKey);
  return access?.featureKeys ?? [];
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

    const featureKeys = await resolveFeatureKeys(typedInput.sourceKey);
    if (featureKeys.length > 0) {
      const results = await Promise.all(
        featureKeys.map((key) => hasFeature(session.user.companyId, key)),
      );
      if (!results.some(Boolean)) {
        return errorResponse("Feature disabled for this export source", 403, {
          featureKeys,
        });
      }
    }

    // Beyond the tenant having bought the module: a school document is a
    // pupil's data and a payslip is one named person's pay, so the module that
    // registered the source says whether this caller may render it.
    const source = documentSourceFor(typedInput.sourceKey);
    if (source?.authorize) {
      const decision = await source.authorize({
        session,
        sourceKey: typedInput.sourceKey,
        recordId: typedInput.recordId,
      });
      if (!decision.allowed) return errorResponse(decision.message, decision.status);
    }

    const queued = await enqueueDocumentRenderJob(session.user.companyId, session.user.id, typedInput);
    if (queued.mode === "ASYNC") {
      const inlineLimit = parseInlineBatchLimit();
      after(async () => {
        try {
          await processDocumentRenderJobsBatch(inlineLimit);
        } catch (error) {
          console.error("[API] inline async render dispatch error:", error);
        }
      });

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
