import { NextResponse, type NextRequest } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";

import { canUseExplore, whoReads } from "./access";
import { exploreRoles } from "./runs";

/** Explore's routes: a signed-in person whose role this workspace lets use Explore, or the answer to send instead. */
export async function exploreGate(request: NextRequest): Promise<{ session: AuthenticatedSession } | { response: NextResponse }> {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) return { response: sessionResult };
  const { session } = sessionResult;
  const roles = await exploreRoles(prisma, session.user.companyId);
  if (!canUseExplore(session.user.role, roles)) return { response: errorResponse(`Only ${whoReads(roles).toLowerCase()} use Explore here`, 403) };
  return { session };
}
