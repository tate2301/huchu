import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { customReportInputSchema } from "@/lib/reports/custom/document";
import { readerOf } from "@/lib/reports/custom/sources";
import { deleteCustomReport, readCustomReport, updateCustomReport } from "@/lib/reports/custom/store";

type Params = { params: Promise<{ id: string }> };

const patchSchema = customReportInputSchema
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nothing to change" });

const NOT_YOURS = "Only whoever made this report, or a manager once it is shared, can change it";

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const report = await readCustomReport(readerOf(sessionResult.session), id);
    if (!report) return errorResponse("Report not found", 404);
    return successResponse({ report });
  } catch (error) {
    console.error("[API] GET /api/v2/reports/custom/[id] error:", error);
    return errorResponse("Failed to load the report");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That change could not be read", 400);
    const outcome = await updateCustomReport(readerOf(sessionResult.session), id, parsed.data);
    if ("error" in outcome) {
      return outcome.error === "missing" ? errorResponse("Report not found", 404) : errorResponse(NOT_YOURS, 403);
    }
    return successResponse({ report: outcome.report });
  } catch (error) {
    console.error("[API] PATCH /api/v2/reports/custom/[id] error:", error);
    return errorResponse("Failed to save the report");
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const outcome = await deleteCustomReport(readerOf(sessionResult.session), id);
    if (outcome === "missing") return errorResponse("Report not found", 404);
    if (outcome === "forbidden") return errorResponse(NOT_YOURS, 403);
    return successResponse({ deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/reports/custom/[id] error:", error);
    return errorResponse("Failed to delete the report");
  }
}
