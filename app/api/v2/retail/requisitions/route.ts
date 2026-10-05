import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { REQUISITION_STATUSES } from "@/lib/crm/requisitions";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  listRetailRequisitions,
  raiseRetailRequisition,
  RequisitionRefused,
  retailRequisitionInput,
} from "@/lib/retail/requisitions";
import { requireRetailSession } from "../_helpers";

const listQuery = z.object({ status: z.enum(REQUISITION_STATUSES).optional() });

function actorOf(session: { user: { companyId: string; id: string; role?: string | null } }) {
  return { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
}

/** The shop's requisitions — a manager's whole list, anybody else's own. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // Every requisition, or only your own (`view-own`); the service scopes the rows.
  const gate =
    requireRetailPermission(session, "retail.requisitions", "view") &&
    requireRetailPermission(session, "retail.requisitions", "view-own");
  if (gate) return gate;

  const query = listQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) return errorResponse("Unknown status", 400);
  const data = await listRetailRequisitions(actorOf(session), { status: query.data.status ?? null });
  return successResponse({ data });
}

/** Ask for money to spend on the shop. */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.requisitions", "create");
  if (gate) return gate;

  try {
    const input = retailRequisitionInput.parse(await request.json());
    const requisition = await raiseRetailRequisition(actorOf(session), input);
    return successResponse({ data: requisition }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Validation failed", 400, error.issues);
    if (error instanceof RequisitionRefused) return errorResponse(error.message, error.status);
    throw error;
  }
}
