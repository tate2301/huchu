import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { canRetailSessionDo, requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { openingJournal } from "@/lib/retail/products/create";
import { productFieldErrors, productPatch } from "@/lib/retail/products/input";
import { afterCommit, productActor, productFailure } from "@/lib/retail/products/routes";
import { updateProduct, type ProductUpdated } from "@/lib/retail/products/update";
import { loadProductView } from "@/lib/retail/products/view";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { postRetailJournal, requireRetailSession } from "../../_helpers";

/**
 * One product (20-products 4.2): its record and its Edit sheet read it here,
 * and change it here. A binned product reads (its record draws the bin
 * banner) and refuses a change (409 "Restore it to change it").
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const data = await loadProductView(session.user.companyId, path.data.id, retailRoleKey(session));
  if (!data) return errorResponse("Product not found", 404);
  return successResponse({ data });
}

/**
 * Change one product (W-11, W-62): any of its fields. `retail.catalog:update`;
 * the price also `retail.prices:update`, and a manager's below-cost price, or
 * any price while the owner approves price changes, is refused under Price;
 * the cost needs `retail.catalog:view-cost`. Answers `{ data, changed }`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "update");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const parsed = productPatch.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    const { error, fieldErrors } = productFieldErrors(parsed.error);
    return fieldErrorResponse(error, fieldErrors);
  }
  const input = parsed.data;
  if (input.price !== undefined) {
    const priceGate = requireRetailPermission(session, "retail.prices", "update");
    if (priceGate) return priceGate;
  }
  if (input.cost !== undefined && !canRetailSessionDo(session, "retail.catalog", "view-cost")) {
    return errorResponse("Your role cannot see what the shop pays", 403);
  }

  const actor = productActor(session);
  const where = "PATCH /api/v2/retail/products/[id]";
  const id = path.data.id;
  let updated: ProductUpdated;
  try {
    const limits = await getApprovalLimits(actor.companyId);
    updated = await prisma.$transaction((tx) => updateProduct(tx, { actor, id, input, limits }));
  } catch (error) {
    return productFailure(error, where);
  }

  const journal = updated.opening
    ? openingJournal({ productId: id, code: updated.code, name: updated.name, ...updated.opening }, actor)
    : null;
  if (journal) await afterCommit(() => postRetailJournal(journal), null, where);
  const saved = { id, code: updated.code, name: updated.name };
  const data = await afterCommit(
    async () => (await loadProductView(actor.companyId, id, retailRoleKey(session))) ?? saved,
    saved,
    where,
  );
  return successResponse({
    data,
    changed: updated.changed.map(({ field, label, from, to }) => ({ field, label, from, to })),
  });
}
