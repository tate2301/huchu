import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { readRunContext } from "@/lib/reports/templates";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../_helpers";

/**
 * A Reports template's starting point (70-insights-reports 4.4): `RunContext`
 * for a built-in (its slug) or a saved template (its id). `retail.reports:view`
 * (owner, manager, bookkeeper; C-35), and the template must be the caller's to
 * open and its source theirs to read; otherwise 404 "Template not found".
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.reports", "view");
  if (gate) return gate;

  const context = await readRunContext(session, (await params).ref);
  if (!context) return errorResponse("Template not found", 404);
  return successResponse(context);
}
