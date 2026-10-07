import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { labelsInputSchema, printLabels } from "@/lib/retail/labels/print";
import { labelFailure } from "@/lib/retail/labels/routes";
import { canRetailSessionDo, requireRetailPermission } from "@/lib/retail/permissions";
import { priceListActor } from "@/lib/retail/price-lists/routes";
import { requireRetailSession } from "../_helpers";

/**
 * Print shelf labels (PRD-06, W-20). A till's printer: 202 `{ jobId, count,
 * printer }`, a job the till pulls. "here": 200 `{ jobId, count, printer,
 * pdfUrl }`, the PDF to open. Owner, manager and stock clerk.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // Who prints labels (PRD-06, C-30): whoever may change catalogue items, or the
  // stock clerk, who adjusts stock on the shelf; anyone else hears the catalogue's refusal.
  const gate = canRetailSessionDo(session, "retail.adjustments", "create")
    ? null
    : requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  const parsed = labelsInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the fields.", fieldErrors);
  }
  try {
    const printed = await printLabels(priceListActor(session), parsed.data);
    if (printed.printer !== "here") return successResponse({ data: printed }, 202);
    return successResponse({ data: { ...printed, pdfUrl: `/api/v2/retail/labels/${printed.jobId}.pdf` } });
  } catch (error) {
    return labelFailure(error, "POST /api/v2/retail/labels");
  }
}
