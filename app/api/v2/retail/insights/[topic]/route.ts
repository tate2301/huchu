import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { INSIGHT_PERIODS, INSIGHT_TOPICS, loadInsight } from "@/lib/retail/insights";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

const params = z.object({ topic: z.enum(INSIGHT_TOPICS) });
const query = z.object({
  days: z.coerce
    .number()
    .refine((value) => (INSIGHT_PERIODS as readonly number[]).includes(value), "Choose 7, 30 or 90 days")
    .default(30),
});

/**
 * One Insights page, worked out on the server. `retail.reports` `view`: the
 * takings, margin and cost in one view are the owner's and the manager's.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ topic: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.reports", "view");
  if (gate) return gate;

  const path = params.safeParse(await context.params);
  if (!path.success) return errorResponse("There is no such insight", 404);
  const period = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!period.success) return errorResponse(period.error.issues[0]?.message ?? "Choose 7, 30 or 90 days", 400);

  return successResponse({ data: await loadInsight(session.user.companyId, path.data.topic, period.data.days) });
}
