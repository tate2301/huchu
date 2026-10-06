import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/api-response";
import { markOpened } from "@/lib/reports/templates";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../../_helpers";

/**
 * A run page was opened (70-insights-reports 4.4): the template's opens go up
 * by one and Last opened becomes now, for the whole workspace. 204; 404
 * "Template not found" as GET. Not audited: opening changes nothing.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ref: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.reports", "view");
  if (gate) return gate;

  if (!(await markOpened(session, (await params).ref))) return errorResponse("Template not found", 404);
  return new NextResponse(null, { status: 204 });
}
