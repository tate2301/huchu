/**
 * Opening a case at the till, so a sale of singles can go through.
 *
 * The till asks for the single the sale needs and how many in all; the server
 * picks the case linked to it (`Product.packOfId`), works out how many to open
 * and opens them at this till's branch through `breakCase`: the cases out, their
 * singles in, as `CASE_BROKEN` movements in one transaction. Only on a shop with
 * cases and singles switched on.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { breakCase, CaseBreakRefused } from "@/lib/retail/stock/cases";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { loadShopProfile, shopFeatures } from "@/lib/retail/shop-profile";
import { requireRetailSession } from "../../_helpers";
import { caseForSingle, caseOpening } from "../_cases";

const schema = z.object({
  /** The single the sale needs. */
  productId: z.string().uuid(),
  /** How many singles the sale needs in all. */
  wanted: z.number().int().positive().max(10000),
});

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);
  const { productId, wanted } = parsed.data;
  const companyId = session.user.companyId;
  const site = device.register.site;

  if (!shopFeatures(await loadShopProfile(companyId)).casesAndSingles) {
    return errorResponse("This shop does not sell cases and singles.", 409);
  }

  const pack = await caseForSingle(companyId, productId);
  const unitsPerCase = pack?.packSize;
  if (!pack || !unitsPerCase) {
    return errorResponse("No case is linked to this product.", 404);
  }

  const [single, cases] = await Promise.all([
    prisma.inventoryItem.findFirst({
      where: { siteId: site.id, site: { companyId }, productId },
      select: { currentStock: true },
    }),
    prisma.inventoryItem.findFirst({
      where: { siteId: site.id, site: { companyId }, productId: pack.id },
      select: { currentStock: true },
    }),
  ]);
  if (!single || !cases) {
    return errorResponse(`${site.name} does not stock both the case and the single.`, 409);
  }

  const singlesOnHand = toNumberOrZero(single.currentStock);
  if (singlesOnHand >= wanted) {
    return errorResponse("There are enough singles on the shelf already.", 409);
  }
  // A case breaks at the till only once its singles have run out (STK-04): the loose ones sell first.
  if (singlesOnHand >= 1) {
    return errorResponse(`Sell the ${singlesOnHand} loose on the shelf first. A case opens once they run out.`, 409);
  }
  const plan = caseOpening({
    wanted,
    singlesOnHand,
    casesOnHand: toNumberOrZero(cases.currentStock),
    unitsPerCase,
  });
  if (!plan) {
    return errorResponse(`Not enough ${pack.name} in stock to cover it.`, 409);
  }

  try {
    const opened = await breakCase({
      actor: {
        companyId,
        userId: session.user.id,
        userName: session.user.name ?? null,
        userRole: session.user.role ?? null,
      },
      caseProductId: pack.id,
      siteId: site.id,
      cases: plan.casesToOpen,
    });
    return successResponse({
      data: {
        casesOpened: opened.cases,
        singlesAdded: opened.singles,
        singlesOnHand: opened.singleOnHand,
        caseName: pack.name,
      },
    });
  } catch (error) {
    if (error instanceof CaseBreakRefused) return errorResponse(error.message, error.status);
    throw error;
  }
}
