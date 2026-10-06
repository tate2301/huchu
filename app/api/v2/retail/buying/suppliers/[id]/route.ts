import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buyingActor, buyingFailure, supplierViewer } from "@/lib/retail/buying/routes";
import { NOT_FOUND, supplierFieldErrors, supplierPatch, updateSupplier } from "@/lib/retail/buying/suppliers";
import { loadSupplierView } from "@/lib/retail/buying/supplier-view";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, parseRetailQuery, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

const rangeQuery = z.object({ range: z.enum(["3m", "12m", "all"]).default("all") });

/** One supplier (40-buying 4.2): its record reads it here. `retail.suppliers:view`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "view");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const query = parseRetailQuery(request, rangeQuery);
  if (query.response) return query.response;

  const data = await loadSupplierView(session.user.companyId, path.data.id, supplierViewer(session), query.data.range);
  if (!data) return errorResponse(NOT_FOUND, 404);
  return successResponse({ data });
}

/**
 * Change a supplier from its rail (W-62, FND 4.9): any of its fields, the
 * rep by `repContactId`. `retail.suppliers:update` (owner, manager,
 * bookkeeper). `{ data, changed }`; 400 under the body's keys; 409 a name taken.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const parsed = supplierPatch.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    const fieldErrors = supplierFieldErrors(parsed.error, "body");
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Validation failed", fieldErrors);
  }

  const actor = buyingActor(session);
  try {
    const changed = await prisma.$transaction((tx) => updateSupplier(tx, actor, path.data.id, parsed.data));
    const data = await loadSupplierView(actor.companyId, path.data.id, supplierViewer(session));
    return successResponse({ data, changed });
  } catch (error) {
    return buyingFailure(error, "PATCH /api/v2/retail/buying/suppliers/[id]");
  }
}
