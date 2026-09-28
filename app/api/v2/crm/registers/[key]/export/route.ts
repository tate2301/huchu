import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { canUser, denialMessage } from "@/lib/crm/permissions";
import { REGISTERS, isEngineRegisterKey } from "@/lib/crm/registers/registry";
import {
  CrmExportRefusedError,
  crmRegisterSourceKey,
} from "@/lib/documents/crm-register-sources";
import { respondWithRender } from "@/lib/documents/render-response";
import { ExportTooLargeError, type DocumentRenderRequest } from "@/lib/documents/service";
import { hasFeature } from "@/lib/platform/features";
import { resolveFeatureKeyForPath } from "@/lib/platform/gating/route-registry";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  format: z.enum(["xlsx", "csv", "pdf"]),
  /** The list's state, as the codec writes it — the query string of the list's own page — plus `tz`. */
  filters: z.record(z.string(), z.string()).default({}),
  /** The rows somebody ticked. Absent: every row the state selects. */
  ids: z.array(z.string().uuid()).min(1).max(500).optional(),
  /** The columns, in order. Absent: the list's default set. */
  columns: z.array(z.string().trim().min(1).max(80)).min(1).max(80).optional(),
  /** What the export is called — the view it was taken from. */
  title: z.string().trim().min(1).max(200).optional(),
  templateId: z.string().uuid().optional(),
  templateVersionId: z.string().uuid().optional(),
  mode: z.enum(["SYNC", "ASYNC"]).optional(),
  idempotencyKey: z.string().max(120).optional(),
});

/**
 * Export a CRM list: the rows its reader was looking at, or the ones they
 * ticked, as a spreadsheet, a CSV or a PDF.
 *
 * Built by the documents pipeline like every other export — the file comes
 * straight back when it is small, and as a job to poll when it is not — and
 * entered here rather than at `/api/documents/render` so it is gated by the
 * list's own page and by `records.export`, and written to the audit trail.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ key: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { key: rawKey } = await context.params;
    const key = rawKey.toUpperCase();
    if (!isEngineRegisterKey(key)) return errorResponse("There is no such list to export", 404);
    const def = REGISTERS[key];

    const feature = resolveFeatureKeyForPath(def.route);
    if (feature && !(await hasFeature(session.user.companyId, feature))) {
      return errorResponse("This list is not switched on for your company", 403, { featureKeys: [feature] });
    }
    if (!(await canUser(session, "records.export"))) {
      return errorResponse(denialMessage("records.export"), 403);
    }

    const body = requestSchema.parse(await request.json());
    const input: DocumentRenderRequest = {
      target: "LIST",
      sourceKey: crmRegisterSourceKey(key),
      format: body.format,
      filters: body.filters,
      ids: body.ids,
      columns: body.columns,
      title: body.title,
      templateId: body.templateId,
      templateVersionId: body.templateVersionId,
      mode: body.mode,
      idempotencyKey: body.idempotencyKey,
    };

    return await respondWithRender(session.user, input, async (decision) => {
      await writePlatformAuditEvent({
        companyId: session.user.companyId,
        actorId: session.user.id,
        eventType: "crm.records.exported",
        entityType: "CRM_LIST",
        entityId: key,
        payload: {
          format: body.format,
          rows: decision.rowCount,
          selected: body.ids?.length ?? 0,
          filters: body.filters,
          columns: body.columns ?? null,
          templateId: body.templateId ?? null,
          jobId: decision.mode === "ASYNC" ? decision.jobId : null,
        },
      });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof ExportTooLargeError || error instanceof CrmExportRefusedError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/crm/registers/[key]/export error:", error);
    return errorResponse("Failed to export the list", 500);
  }
}
