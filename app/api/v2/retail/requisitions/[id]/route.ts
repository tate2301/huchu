import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import {
  actOnRetailRequisition,
  loadRetailRequisition,
  RequisitionRefused,
  requisitionPermissions,
  retailRequisitionAction,
} from "@/lib/retail/requisitions";
import { requireRetailSession } from "../../_helpers";

function actorOf(session: { user: { companyId: string; id: string; role?: string | null } }) {
  return { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
}

/** One requisition, and what the person reading it may do with it. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // Every requisition, or only your own (`view-own`); the service scopes the rows.
  const gate =
    requireRetailPermission(session, "retail.requisitions", "view") &&
    requireRetailPermission(session, "retail.requisitions", "view-own");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const actor = actorOf(session);
  const requisition = await loadRetailRequisition(actor, path.data.id);
  if (!requisition) return errorResponse("Requisition not found", 404);
  return successResponse({ data: requisition, permissions: requisitionPermissions(actor, requisition) });
}

/**
 * Submit, cancel, decide or pay — one action per request. Who may do which is
 * decided in `actOnRetailRequisition`, against the requisition, because "your
 * own" and "not your own" are facts about the row, not the role.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  // Every requisition, or only your own (`view-own`); the service scopes the rows.
  const gate =
    requireRetailPermission(session, "retail.requisitions", "view") &&
    requireRetailPermission(session, "retail.requisitions", "view-own");
  if (gate) return gate;
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  try {
    const act = retailRequisitionAction.parse(await request.json());
    const requisition = await actOnRetailRequisition(actorOf(session), path.data.id, act);
    return successResponse({ data: requisition });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (error instanceof RequisitionRefused) return errorResponse(error.message, error.status);
    throw error;
  }
}
