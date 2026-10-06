import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { createProduct, openingJournal, openingOf } from "@/lib/retail/products/create";
import { productFieldErrors, productInput } from "@/lib/retail/products/input";
import { productActor, productFailure } from "@/lib/retail/products/routes";
import { loadProductView } from "@/lib/retail/products/view";

import { postRetailJournal, requireRetailSession } from "../_helpers";

/**
 * Add a product (W-09, 20-products 4.2): New product, over Products or On
 * hand. `retail.catalog:create`, and `retail.prices:update` for the price it
 * goes on sale at. 201 `{ data: ProductView }`; 400 `{ error, fieldErrors }`
 * under the field (a name or barcode already taken, a barcode of the wrong
 * length, a category or supplier not the shop's). Opening stock with a cost
 * posts Dr Stock / Cr Opening balances after the commit.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate =
    requireRetailPermission(session, "retail.catalog", "create") ?? requireRetailPermission(session, "retail.prices", "update");
  if (gate) return gate;

  const parsed = productInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    const fieldErrors = productFieldErrors(parsed.error);
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the fields.", fieldErrors);
  }

  // The sheet asks for a category; only the product field's quick add goes without one.
  if (!parsed.data.categoryId) {
    return fieldErrorResponse("Choose a category.", { categoryId: "Choose a category." });
  }

  const actor = productActor(session);
  try {
    const created = await prisma.$transaction((tx) => createProduct(tx, { actor, input: parsed.data, source: "ADDED" }));
    const journal = openingJournal(openingOf(created), actor);
    if (journal) await postRetailJournal(journal);
    const data = await loadProductView(actor.companyId, created.productId, retailRoleKey(session));
    return successResponse({ data }, 201);
  } catch (error) {
    return productFailure(error, "POST /api/v2/retail/products");
  }
}
