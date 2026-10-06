import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { insightRangeRefusal } from "@/lib/retail/insight-range";
import { INSIGHT_PERIODS, INSIGHT_TOPICS, loadInsight } from "@/lib/retail/insights";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

const params = z.object({ topic: z.enum(INSIGHT_TOPICS) });
const query = z.object({
  period: z.enum(INSIGHT_PERIODS, { message: "Choose Today, 7 days, 30 days or This month" }).default("30d"),
  siteId: z.string().min(1).default("all"),
  from: z.string().optional(),
  to: z.string().optional(),
});

/**
 * One Insights page, worked out on the server for the toolbar's period (or
 * the `from`/`to` days chosen, which win over it) and site.
 * `retail.insights` `view`; the Money page also `retail.money` `view`.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ topic: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.insights", "view");
  if (gate) return gate;

  const path = params.safeParse(await context.params);
  if (!path.success) return errorResponse("There is no such insight", 404);
  // "Managers do not see Money" (the Roles board): the nav hides the item,
  // and this is the check.
  if (path.data.topic === "money") {
    const moneyGate = requireRetailPermission(session, "retail.money", "view");
    if (moneyGate) return moneyGate;
  }
  const parsed = query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "That period could not be read", 400);

  const { from, to } = parsed.data;
  if ((from === undefined) !== (to === undefined)) return errorResponse("That period could not be read", 400);
  const range = from !== undefined && to !== undefined ? { from, to } : null;
  const refusal = range ? insightRangeRefusal(range) : null;
  if (refusal) return errorResponse(refusal, 400);

  const companyId = session.user.companyId;
  const siteId = parsed.data.siteId === "all" ? null : parsed.data.siteId;
  if (siteId) {
    const site = await prisma.site.findFirst({ where: { id: siteId, companyId }, select: { id: true } });
    if (!site) return errorResponse("That site is not this business’s", 400);
  }

  return successResponse({ data: await loadInsight(companyId, path.data.topic, range ?? parsed.data.period, siteId) });
}
