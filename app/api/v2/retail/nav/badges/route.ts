import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { computeNavBadges, NAV_BADGE_PROVIDERS } from "@/lib/retail/nav-badges";
import { navConditions } from "@/lib/retail/nav/conditions";
import { requireRetailSession } from "../../_helpers";

/**
 * The figures beside the panel's items (00-foundations 4.3), for the caller's
 * role: `{ badges: { "/retail/shifts": "2 open" }, conditions: { "multi-site": true } }`.
 * A provider whose grants the role does not hold is not counted at all; the
 * conditions are the shop facts items wait on (`RetailNavItem.when`).
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const role = session.user.role ?? "";

  const providers = NAV_BADGE_PROVIDERS.filter((provider) =>
    provider.requires.some(([resource, action]) => canRetailSessionDo(session, resource, action)),
  );
  const [badges, conditions] = await Promise.all([
    computeNavBadges({ companyId: session.user.companyId, userId: session.user.id, role }, providers),
    navConditions(session.user.companyId),
  ]);
  return successResponse({ badges, conditions });
}
