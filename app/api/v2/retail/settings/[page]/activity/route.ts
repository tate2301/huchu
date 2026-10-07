import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { readSettingsActivity, settingsHandler } from "@/lib/retail/settings";
import { requireRetailSession } from "../../../_helpers";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(50).default(10),
});

/**
 * A settings page's Activity (the header's "Activity"): its saves and the
 * events of the rows it changes, newest first, `?page=1&size=10` →
 * `{ total, rows }`. Reading the page and Activity are both needed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ page: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const { page: key } = await params;
  const handler = settingsHandler(key);
  if (!handler) return errorResponse("There is no such settings page", 404);

  const readGate = requireRetailPermission(session, handler.page.read[0], handler.page.read[1]);
  if (readGate) return readGate;
  const activityGate = requireRetailPermission(session, "retail.activity", "view");
  if (activityGate) return activityGate;

  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return errorResponse("Validation failed", 400, query.error.issues);

  return successResponse(await readSettingsActivity(session.user.companyId, key, query.data));
}
