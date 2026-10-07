import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireLiveTillDevice } from "@/lib/retail/till-device-server";
import { requireRetailSession } from "../../../_helpers";

/**
 * The category chips above the till's shelf.
 *
 * S-4b — a category belongs to the stock row, and a stock row is on the range
 * when it names a product. That is the whole join now; it used to be a read of
 * `RetailCatalogItem` to collect inventory ids and a second read to get their
 * categories.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Names only, but it is the range, so it answers to the range's gate.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  // The shop this till stands in.
  const device = await requireLiveTillDevice();
  if (!device || device.companyId !== session.user.companyId) {
    return errorResponse("This device is not a till. Pair it first.", 403);
  }

  const rows = await prisma.inventoryItem.findMany({
    where: {
      site: { companyId: session.user.companyId },
      siteId: device.register.siteId,
      product: { companyId: session.user.companyId, isActive: true, archivedAt: null },
    },
    select: { category: true, product: { select: { ageRestricted: true } } },
  });

  // A group whose every product is 18+ stops with the licence hours; the till says what still sells.
  const groups = new Map<string, boolean>();
  for (const row of rows) {
    const name = row.category?.trim();
    if (!name) continue;
    const allAgeRestricted = (groups.get(name) ?? true) && Boolean(row.product?.ageRestricted);
    groups.set(name, allAgeRestricted);
  }

  return successResponse({
    data: [...groups.entries()]
      .map(([name, allAgeRestricted]) => ({ name, allAgeRestricted }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  });
}
