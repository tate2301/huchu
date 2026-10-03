import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findLiveRetailCategory } from "@/lib/retail/categories";

/**
 * The fields a product carries beyond what the till prints — its category,
 * what the shop pays, when to reorder, and the deposit on its empty.
 *
 * Shared by `POST /catalog` and `PATCH /catalog/[id]` so the one product form
 * sends the same shape whether it is adding or editing.
 */
export const productDetailFields = {
  /** The shop's own category. Null takes the product out of one. */
  categoryId: z.string().uuid().nullable().optional(),
  costPrice: z.number().min(0).nullable().optional(),
  /** Stock at or below this shows as low. Null means never ask. */
  reorderLevel: z.number().min(0).nullable().optional(),
  returnable: z.boolean().optional(),
  depositAmount: z.number().min(0).max(1_000).nullable().optional(),
  /** A case: the single it opens into. Null makes it an ordinary product. */
  packOfId: z.string().uuid().nullable().optional(),
  /** How many singles are in the case. */
  packSize: z.number().int().min(2).max(1_000).nullable().optional(),
};

type ProductDetails = z.infer<z.ZodObject<typeof productDetailFields>>;

/** The `upsertShelfListing` arguments those fields become. */
export function productDetailWrites(input: ProductDetails) {
  return {
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    ...(input.costPrice === undefined ? {} : { costPrice: input.costPrice }),
    ...(input.returnable === undefined ? {} : { returnable: input.returnable }),
    ...(input.depositAmount === undefined ? {} : { depositAmount: input.depositAmount }),
    // A case and its size travel together: no single, no size.
    ...(input.packOfId === undefined
      ? {}
      : { packOfId: input.packOfId, packSize: input.packOfId ? (input.packSize ?? null) : null }),
  };
}

/**
 * What is wrong with the details, or null.
 *
 * The category has to be one of this shop's live ones. A case has to name a
 * single of this shop's that is not itself and not a case — a case of cases is
 * a pallet, and nothing breaks a pallet at the counter — and say how many.
 */
export async function productDetailsProblem(
  companyId: string,
  input: ProductDetails,
  productId: string | null,
): Promise<string | null> {
  if (input.categoryId && !(await findLiveRetailCategory(companyId, input.categoryId))) {
    return "That category is not one of this shop's";
  }
  if (input.packOfId) {
    if (!input.packSize) return "Say how many singles are in the case";
    if (input.packOfId === productId) return "A case cannot be a case of itself";
    const single = await prisma.product.findFirst({
      where: { id: input.packOfId, companyId, archivedAt: null },
      select: { packOfId: true },
    });
    if (!single) return "That single is not one of this shop's products";
    if (single.packOfId) return "That product is itself a case; choose the single";
  }
  return null;
}
