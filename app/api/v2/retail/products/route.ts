import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { createProduct, openingJournal, openingOf, type ProductCreated } from "@/lib/retail/products/create";
import { productFieldErrors, productInput } from "@/lib/retail/products/input";
import { afterCommit, productActor, productFailure } from "@/lib/retail/products/routes";
import { loadProductView } from "@/lib/retail/products/view";

import { postRetailJournal, requireRetailSession } from "../_helpers";

/**
 * Add a product (W-09, 20-products 4.2): New product, over Products or On
 * hand. `retail.catalog:create`, and `retail.prices:update` for the price it
 * goes on sale at. 201 `{ data: ProductView }`; 400 `{ error, fieldErrors }`
 * under the field (a name or barcode already taken, a barcode of the wrong
 * length, a category or supplier not the shop's, a manager's price below
 * the cost given). Opening stock with a cost posts Dr Stock / Cr Opening
 * balances after the commit.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate =
    requireRetailPermission(session, "retail.catalog", "create") ?? requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const parsed = productInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    const { error, fieldErrors } = productFieldErrors(parsed.error);
    return fieldErrorResponse(error, fieldErrors);
  }

  // The sheet asks for a category; only the product field's quick add goes without one.
  if (!parsed.data.categoryId) {
    return fieldErrorResponse("Choose a category.", { categoryId: "Choose a category." });
  }

  const actor = productActor(session);
  const where = "POST /api/v2/retail/products";
  let created: ProductCreated;
  try {
    const limits = await getApprovalLimits(actor.companyId);
    created = await prisma.$transaction((tx) => createProduct(tx, { actor, input: parsed.data, source: "ADDED", limits }));
  } catch (error) {
    return productFailure(error, where);
  }

  const journal = openingJournal(openingOf(created), actor);
  if (journal) await afterCommit(() => postRetailJournal(journal), null, where);
  const saved = { id: created.productId, code: created.code, name: created.name, price: Number(created.price) };
  const data = await afterCommit(
    async () => (await loadProductView(actor.companyId, created.productId, retailRoleKey(session))) ?? saved,
    saved,
    where,
  );
  return successResponse({ data }, 201);
}
