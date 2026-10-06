import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buyingActor, buyingFailure, supplierViewer } from "@/lib/retail/buying/routes";
import { resumeSupplier, stopSupplier } from "@/lib/retail/buying/suppliers";
import { loadSupplierView } from "@/lib/retail/buying/supplier-view";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../../_helpers";

/**
 * "Stop buying from them" (POST) and "Buy from them again" (DELETE), W-29.
 * `retail.suppliers:delete` (owner, manager). Stopping waits while an order
 * of theirs is open: 409 "PO-0005 is still open with Afdis Distillers. Close
 * or cancel it first."
 */
type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "delete");
  if (gate) return gate;

  return act(session, params, "stop");
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "delete");
  if (gate) return gate;

  return act(session, params, "resume");
}

/** The shared body once the caller is through the gate. */
async function act(session: Parameters<typeof buyingActor>[0], params: Params["params"], how: "stop" | "resume") {
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const actor = buyingActor(session);
  try {
    await prisma.$transaction((tx) => (how === "stop" ? stopSupplier(tx, actor, path.data.id) : resumeSupplier(tx, actor, path.data.id)));
    const data = await loadSupplierView(actor.companyId, path.data.id, supplierViewer(session));
    return successResponse({ data });
  } catch (error) {
    return buyingFailure(error, `${how === "stop" ? "POST" : "DELETE"} /api/v2/retail/buying/suppliers/[id]/stop`);
  }
}
