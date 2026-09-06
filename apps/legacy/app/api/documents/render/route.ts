import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, validateSession } from "@corelithzw/platform/api-utils";
import {
  enqueueDocumentRenderJob,
  processDocumentRenderJobsBatch,
  renderDocumentSync,
} from "@corelithzw/module-documents/service";
import { hasFeature } from "@corelithzw/platform/features";
import {
  isSchoolDocumentSourceKey,
  SCHOOL_DOCUMENT_ACCESS,
} from "@/lib/schools/document-sources";
import {
  canRenderPayslip,
  HR_DOCUMENT_ACCESS,
  isHrDocumentSourceKey,
} from "@corelithzw/module-people/hr/document-sources";
import { isApproverRole } from "@corelithzw/module-workflow/approvals";
import { canSchoolRoleDo } from "@/lib/schools/permissions";
import type { DocumentRenderRequest } from "@corelithzw/module-documents/service";

export const runtime = "nodejs";

function parseInlineBatchLimit() {
  const configured = Number(process.env.PDF_INLINE_BATCH_LIMIT ?? 2);
  if (!Number.isFinite(configured)) return 2;
  return Math.max(1, Math.min(10, Math.floor(configured)));
}

/**
 * Feature keys that may authorise an export source. A tenant needs only ONE of
 * them — sales documents are reachable from both accounting and the CRM, so a
 * CRM-only tenant must be able to render the quotation it just created.
 */
function resolveFeatureKeys(sourceKey: string): string[] {
  if (sourceKey === "reports.shift") return ["reports.shift"];
  if (sourceKey === "reports.attendance") return ["reports.attendance"];
  if (sourceKey === "reports.plant") return ["reports.plant"];
  if (sourceKey === "dashboard.executive-summary") return ["reports.dashboard"];
  if (sourceKey === "accounting.sales.invoice") return ["accounting.ar", "crm.documents"];
  if (sourceKey === "accounting.sales.quotation") return ["accounting.ar", "crm.documents"];
  if (sourceKey === "accounting.sales.receipt") return ["accounting.ar", "crm.documents"];
  if (sourceKey === "accounting.sales.credit-note") return ["accounting.ar"];
  // Iteration 5 — the school's paper. One feature each, and a role check as well;
  // see below.
  if (isSchoolDocumentSourceKey(sourceKey)) {
    return [SCHOOL_DOCUMENT_ACCESS[sourceKey].feature];
  }
  // A payslip. Either key opens the door, because an employee fetching their own
  // has `hr.employee-self-service` and not `hr.payslips` — the row-level check
  // below is what keeps them to their own.
  if (isHrDocumentSourceKey(sourceKey)) {
    const access = HR_DOCUMENT_ACCESS[sourceKey];
    return access.selfServiceFeature
      ? [access.feature, access.selfServiceFeature]
      : [access.feature];
  }
  return [];
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

    const featureKeys = resolveFeatureKeys(typedInput.sourceKey);
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

    // A school document is a pupil's data — a class list is every child's
    // guardian and phone number on one page — so the tenant having bought the
    // module is not the bar. `view` because rendering reads; nothing here writes.
    if (isSchoolDocumentSourceKey(typedInput.sourceKey)) {
      const { resource } = SCHOOL_DOCUMENT_ACCESS[typedInput.sourceKey];
      if (!canSchoolRoleDo(session.user.role, resource, "view")) {
        return errorResponse(
          `Your role cannot view ${resource.replace("schools.", "")}`,
          403,
        );
      }
    }

    // A payslip is one named person's pay. The feature check above says the
    // tenant has payroll; this says whose payslip the caller may see. HR staff
    // see any; everybody else sees their own and nothing else.
    if (isHrDocumentSourceKey(typedInput.sourceKey)) {
      if (!typedInput.recordId) {
        return errorResponse("A payslip needs the payroll line it belongs to", 400);
      }
      const decision = await canRenderPayslip({
        companyId: session.user.companyId,
        lineItemId: typedInput.recordId,
        userId: session.user.id,
        hasPayrollAccess:
          isApproverRole(session.user.role) &&
          (await hasFeature(session.user.companyId, HR_DOCUMENT_ACCESS["hr.payslip"].feature)),
      });
      if (!decision.allowed) {
        // 404, not 403: a 403 would confirm the payslip exists, which lets
        // somebody map the workforce by probing ids.
        return errorResponse(decision.reason, 404);
      }
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
