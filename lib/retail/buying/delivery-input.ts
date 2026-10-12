import { z } from "zod";

/**
 * The delivery bodies (40-buying 4.4): `POST /deliveries` (count, and post
 * when allowed), `PATCH /deliveries/[id]` (one rail value) and the bulk
 * posts. Quantities are single units.
 */

const file = z.object({
  url: z.string().min(1).max(2000),
  name: z.string().max(200),
  contentType: z.string().max(100),
  size: z.number().int().positive(),
});

export const receiveSchema = z.object({
  purchaseOrderId: z.string().uuid().nullable().optional(),
  supplierId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
  noteNumber: z.string().trim().max(60).nullable().optional(),
  driver: z.string().trim().max(120).nullable().optional(),
  countedById: z.string().uuid().nullable().optional(),
  photo: file.nullable().optional(),
  lines: z
    .array(
      z.object({
        purchaseOrderLineId: z.string().uuid().nullable().optional(),
        inventoryItemId: z.string().uuid(),
        quantity: z.number().min(0).max(1_000_000),
        damaged: z.number().min(0).max(1_000_000).optional(),
        unitCost: z.number().min(0).max(1_000_000).nullable().optional(),
        rest: z.enum(["KEEP", "CLOSE"]).optional(),
      }),
    )
    .min(1, "Count at least one line.")
    .max(300),
  empties: z.object({ crates: z.number().int().min(0).max(10_000) }).nullable().optional(),
  requisitionId: z.string().uuid().nullable().optional(),
  paying: z.object({ mode: z.enum(["ON_ACCOUNT", "NOT_YET", "CASH_NOW"]) }).nullable().optional(),
  post: z.boolean(),
  periodOverrideReason: z.string().max(500).nullable().optional(),
});

export const deliveryPatchSchema = z
  .object({
    noteNumber: z.string().max(60).nullable().optional(),
    driver: z.string().max(120).nullable().optional(),
    countedById: z.string().uuid().nullable().optional(),
  })
  .strict();

export const bulkDeliveriesSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "Tick at least one delivery.").max(100, "Tick at most 100 deliveries.") });
