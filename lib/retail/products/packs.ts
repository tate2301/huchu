import { Prisma } from "@prisma/client";
import { z } from "zod";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { getApprovalLimits } from "@/lib/retail/approvals/limits";
import { centsOf, PRICE_FIGURE_MESSAGE } from "@/lib/retail/prices/figure";
import { formatMoney } from "@/lib/workspace/format";

import { createProduct, ProductRefusal } from "./create";
import { BARCODE_MESSAGE, normalizeBarcode } from "./input";

/**
 * Sell by the case (W-12, PRD-08, 20-products 4.6): a case is its own
 * product, made from its single. Its name, category and VAT come from the
 * single; its cost is the single's times how many it holds; it is kept,
 * empty, at every site the single is; it goes on sale at its price on the
 * default list. Cases and singles are counted apart, and opening a case
 * moves its singles in (STK-04), at the till too when "Break cases at the
 * till" is on.
 */

export const packInput = z.object({
  singleId: z.string().uuid("Pick the single."),
  size: z.number({ message: "A case holds 2 to 1,000." }).int("A case holds 2 to 1,000.").min(2, "A case holds 2 to 1,000.").max(1000, "A case holds 2 to 1,000."),
  name: z.string().trim().max(200).optional().nullable(),
  price: z.string().max(40),
  barcode: z.string().max(40).optional().nullable(),
  breakAtTill: z.boolean().default(true),
  crateDeposit: z.string().max(40).optional().nullable(),
});
export type PackInput = z.infer<typeof packInput>;

/** "Castle Lager 340ml, case of 24": what a case is called until it is renamed. */
export const caseName = (single: string, size: number) => `${single}, case of ${size}`;

export async function createPack(
  actor: RetailAuditActor,
  input: PackInput,
): Promise<{ productId: string; name: string; message: string }> {
  const { companyId } = actor;
  const cents = centsOf(input.price);
  if (cents === null) throw new ProductRefusal(400, PRICE_FIGURE_MESSAGE, "price");
  if (cents <= 0) throw new ProductRefusal(400, "The case needs a price.", "price");
  const deposit = input.crateDeposit?.trim() ? centsOf(input.crateDeposit) : 0;
  if (deposit === null) throw new ProductRefusal(400, PRICE_FIGURE_MESSAGE, "crateDeposit");
  const barcode = input.barcode?.trim() ? normalizeBarcode(input.barcode.trim()) : null;
  if (input.barcode?.trim() && !barcode) throw new ProductRefusal(400, BARCODE_MESSAGE, "barcode");

  const single = await prisma.product.findFirst({
    where: { id: input.singleId, companyId, archivedAt: null },
    select: {
      id: true,
      name: true,
      categoryId: true,
      costPrice: true,
      defaultTaxRate: true,
      ageRestricted: true,
      packOfId: true,
      inventoryItems: { orderBy: { createdAt: "asc" }, select: { siteId: true } },
    },
  });
  if (!single) throw new ProductRefusal(400, "Pick one of this shop's products.", "single");
  if (single.packOfId) throw new ProductRefusal(400, `${single.name} is a case. Choose the single.`, "single");
  const already = await prisma.product.findFirst({
    where: { companyId, packOfId: single.id, packSize: input.size, archivedAt: null },
    select: { id: true },
  });
  if (already) throw new ProductRefusal(409, `${single.name} already has a case of ${input.size}.`);

  const name = input.name?.trim() || caseName(single.name, input.size);
  const price = (cents / 100).toFixed(2);
  const sites = [...new Set(single.inventoryItems.map((line) => line.siteId))];
  const profile = await prisma.retailShopProfile.findUnique({ where: { companyId }, select: { defaultSiteId: true } });
  const main = sites.includes(profile?.defaultSiteId ?? "") ? profile!.defaultSiteId! : (sites[0] ?? null);
  const limits = await getApprovalLimits(companyId);

  const created = await prisma.$transaction(async (tx) => {
    const made = await createProduct(tx, {
      actor,
      input: {
        name,
        categoryId: single.categoryId,
        price,
        barcode,
        cost: single.costPrice ? money(single.costPrice).times(input.size).toFixed(2) : null,
        soldAs: "SINGLE",
        returnable: deposit > 0,
        depositAmount: deposit > 0 ? (deposit / 100).toFixed(2) : null,
        ageCheck: single.ageRestricted,
      },
      source: "ADDED",
      siteId: main,
      limits,
      pack: { of: { id: single.id, name: single.name }, size: input.size, breakAtTill: input.breakAtTill, alsoAt: sites },
    });
    // The single's own VAT, which may not be its category's.
    await tx.product.update({ where: { id: made.productId }, data: { defaultTaxRate: single.defaultTaxRate ?? new Prisma.Decimal(0) } });
    return made;
  });
  const lead = input.name?.trim() ? name : `${name},`;
  return { productId: created.productId, name, message: `${lead} is on sale at ${formatMoney(cents / 100)}.` };
}
