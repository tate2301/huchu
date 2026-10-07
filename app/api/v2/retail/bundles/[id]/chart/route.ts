import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { isBundleId } from "@/lib/retail/bundles/routes";
import { bundleChart } from "@/lib/retail/bundles/service";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";
import { requireRetailSession } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

const chartQuery = z.object({ range: z.enum(["3m", "12m", "all"]).default("12m") });

/** "Bundles sold per week" (the record's chart): `{ weeks: [{ start, sold }] }`. `retail.promotions:view`. */
export async function GET(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.promotions", "view");
  if (gate) return gate;

  const { id } = await params;
  if (!isBundleId(id)) return errorResponse("Bundle not found", 404);
  const query = parseRetailQuery(request, chartQuery);
  if (query.response) return query.response;
  const data = await bundleChart(session.user.companyId, id, query.data.range);
  if (!data) return errorResponse("Bundle not found", 404);
  return successResponse({ data });
}
