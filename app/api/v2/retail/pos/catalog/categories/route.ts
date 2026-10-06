import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requirePosDevice } from "@/lib/retail/devices";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { ageCheckFor } from "@/lib/retail/products/age-check";
import { requireRetailSession } from "../../../_helpers";

/**
 * The category chips above the till's shelf.
 *
 * The shop's own categories (Products › Categories), in the shop's order, that
 * have something on sale at this branch. It used to be the distinct
 * `InventoryItem.category` values — the stores module's FUEL / SPARES /
 * CONSUMABLES, which is how a bottle store's till came to offer "Consumables".
 *
 * The branch is the till's. `allAgeRestricted` says every product the chip
 * holds there asks for ID, so the till can stop the whole chip outside the
 * licence hours.
 */

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Names only, but it is the range, so it answers to the range's gate.
  const gate = requireRetailPermission(session, "retail.catalog", "view");
  if (gate) return gate;

  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;

  const companyId = session.user.companyId;
  const onSale = {
    companyId,
    isActive: true,
    archivedAt: null,
    inventoryItems: { some: { siteId: device.register.site.id } },
  };
  const rows = await prisma.retailCategory.findMany({
    where: { companyId, archivedAt: null, products: { some: onSale } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true, ageRestricted: true, products: { where: onSale, select: { ageRestricted: true } } },
  });

  return successResponse({
    data: rows.map((row) => ({
      name: row.name,
      allAgeRestricted: row.products.every((product) =>
        ageCheckFor({ ageRestricted: product.ageRestricted, retailCategory: row }),
      ),
    })),
  });
}
