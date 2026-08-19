import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailPermission } from "@/lib/retail/permissions";
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

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId")?.trim();

  const rows = await prisma.inventoryItem.findMany({
    where: {
      site: { companyId: session.user.companyId },
      ...(siteId ? { siteId } : {}),
      product: { companyId: session.user.companyId, isActive: true, archivedAt: null },
    },
    select: { category: true },
    distinct: ["category"],
  });

  return successResponse({
    data: [
      ...new Set(
        rows
          .map((row) => row.category?.trim())
          .filter((category): category is string => Boolean(category)),
      ),
    ].sort((left, right) => left.localeCompare(right)),
  });
}
