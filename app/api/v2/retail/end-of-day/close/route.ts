import { NextRequest, NextResponse } from "next/server";

import { answerCloseDay } from "@/lib/retail/floor/day-close";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * Close the day (50-floor W-43, FLR-07): every till's Z-report, the figures
 * frozen, the cash banked to the default bank account. Once per site and day;
 * owners and managers.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const refused = requireRetailPermission(session, "retail.end-of-day", "create");
  if (refused) return refused;
  return answerCloseDay({ session, body: await request.json().catch(() => null) });
}
