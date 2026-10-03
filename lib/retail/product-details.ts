import { z } from "zod";

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
};

type ProductDetails = z.infer<z.ZodObject<typeof productDetailFields>>;

/** The `upsertShelfListing` arguments those fields become. */
export function productDetailWrites(input: ProductDetails) {
  return {
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    ...(input.costPrice === undefined ? {} : { costPrice: input.costPrice }),
    ...(input.returnable === undefined ? {} : { returnable: input.returnable }),
    ...(input.depositAmount === undefined ? {} : { depositAmount: input.depositAmount }),
  };
}
