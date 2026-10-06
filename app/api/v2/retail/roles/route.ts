import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { peopleRolesView } from "@/lib/retail/people/roles-view";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../_helpers";

/** "Who can do what" (80-admin 5.4): the matrix the server enforces, with its live limits. `retail.people:view`. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.people", "view");
  if (gate) return gate;
  return successResponse(peopleRolesView());
}
