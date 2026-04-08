import { z } from "zod";

export const SCRAP_TICKET_PHOTO_CONTEXTS = [
  "scrap-purchase-ticket-photo",
  "scrap-sale-ticket-photo",
] as const;

export const scrapTicketPhotoSchema = z.object({
  url: z.string().url().max(2048),
  pathname: z.string().min(1).max(1024).optional(),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().min(0).max(10 * 1024 * 1024),
  context: z.enum(SCRAP_TICKET_PHOTO_CONTEXTS),
  uploadedAt: z.string().datetime().optional(),
});

export const scrapTicketPhotoArraySchema = z.array(scrapTicketPhotoSchema).max(12);

export type ScrapTicketPhoto = z.infer<typeof scrapTicketPhotoSchema>;

export function parseScrapTicketPhotosJson(value: string | null | undefined): ScrapTicketPhoto[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    const normalized = scrapTicketPhotoArraySchema.safeParse(parsed);
    return normalized.success ? normalized.data : [];
  } catch {
    return [];
  }
}

export function serializeScrapTicketPhotos(value: ScrapTicketPhoto[] | null | undefined): string | null {
  if (!value || value.length === 0) return null;
  return JSON.stringify(scrapTicketPhotoArraySchema.parse(value));
}
