import { prisma } from "@/lib/prisma";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";
import { atSiteWords } from "@/lib/retail/stock/transfer-words";
import { formatCount } from "@/lib/workspace/format";

import type { LookupNoun } from "./types";

/**
 * Stock's nouns (30-stock 4.7): `stock-line`, a product's stock at one site.
 *
 * Searched by product name, code or barcode (a barcode picks exactly) among
 * the lines at `context.siteId`, or at every site with `context.everySite`
 * (Change reorder levels over lines ticked at two sites). `context.lineIds`
 * reads those lines wherever they are (a sheet opened from ticked rows on On
 * hand); `context.productIds` with `siteId` finds the same products at that
 * site (the transfer's From changed). The sub is "9 at Harare Main Branch" for
 * a transfer (`context.for = "transfer"`) or across every site, else "9
 * bottles". Each option carries the product it is of and, for someone who may
 * see cost, the line's cost.
 */
const stockLine: LookupNoun = {
  noun: "stock-line",
  read: [
    ["retail.stock", "view"],
    ["retail.transfers", "create"],
    ["retail.counts", "create"],
    ["retail.adjustments", "create"],
  ],
  quick: [],
  async search(ctx, q, context) {
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : null);
    const siteId = typeof context.siteId === "string" ? context.siteId : null;
    const lineIds = strings(context.lineIds);
    const productIds = strings(context.productIds);
    const everySite = !siteId && context.everySite === true;
    if (!siteId && !lineIds && !everySite) return [];

    const needle = q.trim();
    const lines = await prisma.inventoryItem.findMany({
      where: {
        site: { companyId: ctx.companyId },
        ...(lineIds ? { id: { in: lineIds } } : siteId ? { siteId } : {}),
        ...(productIds ? { productId: { in: productIds } } : {}),
        product: {
          is: {
            companyId: ctx.companyId,
            archivedAt: null,
            ...(needle
              ? {
                  OR: [
                    { name: { contains: needle, mode: "insensitive" as const } },
                    { code: { contains: needle, mode: "insensitive" as const } },
                    { barcode: needle },
                  ],
                }
              : {}),
          },
        },
      },
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        siteId: true,
        unit: true,
        currentStock: true,
        unitCost: true,
        site: { select: { name: true } },
        product: { select: { id: true, name: true, barcode: true } },
      },
    });
    // A scanned barcode is that product and nothing else.
    const scanned = needle ? lines.filter((line) => line.product?.barcode === needle) : [];
    const canSeeCost = canRetailSessionDo(ctx.session, "retail.catalog", "view-cost");
    const atSite = context.for === "transfer" || everySite;
    return (scanned.length > 0 ? scanned : lines).map((line) => {
      const onHand = line.currentStock.toNumber();
      return {
        id: line.id,
        label: line.product?.name ?? "",
        sub: atSite ? atSiteWords(onHand, line.site.name) : `${formatCount(onHand)} ${line.unit}${onHand === 1 ? "" : "s"}`,
        of: line.product?.id ?? null,
        siteId: line.siteId,
        site: line.site.name,
        onHand,
        ...(canSeeCost ? { cost: (line.unitCost?.toNumber() ?? 0).toFixed(2) } : {}),
      };
    });
  },
};

export const STOCK_LOOKUPS: LookupNoun[] = [stockLine];
