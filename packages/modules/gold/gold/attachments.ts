import { z } from "zod"

export const goldPurchaseAttachmentsSchema = z.array(
  z.object({
    url: z.string().url(),
    filename: z.string(),
    mimeType: z.string(),
    sizeBytes: z.number().int().nonnegative(),
    uploadedById: z.string().uuid(),
    uploadedAt: z.string().datetime(),
  }),
)

export type GoldPurchaseAttachment = z.infer<
  typeof goldPurchaseAttachmentsSchema
>[number]
