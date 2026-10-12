import type { Prisma, RetailAttachmentKind } from "@prisma/client";

import type { RetailAuditActor } from "@/lib/retail/audit";
import { sniffImageType } from "@/lib/retail/catalog-image";

/**
 * Files the buying screens keep (40-buying 3.3 C, 4.4): a requisition's
 * quote and receipts, and later a bill's file, a delivery note, photos. The
 * upload route stores the bytes and answers what it stored; the service that
 * owns the record writes the `RetailAttachment` row, so a file chosen and then
 * abandoned costs a blob, never a half-written record.
 */

type Tx = Prisma.TransactionClient;

/** 10 MB. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const NOT_A_FILE = "That file is not a PDF or a picture.";
export const TOO_BIG = "That file is over 10 MB.";

export type AttachmentType = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";

const EXTENSION: Record<AttachmentType, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** What an upload answers, and what a service is handed back to keep it. */
export type UploadedFile = { url: string; name: string; contentType: string; size: number };

/** A PDF's first bytes ("%PDF"), else a picture's. Trusted over what the browser says. */
export function sniffAttachmentType(bytes: Uint8Array): AttachmentType | null {
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  return sniffImageType(bytes);
}

export type AttachmentCheck = { ok: true; type: AttachmentType; extension: string } | { ok: false; error: string };

export function checkAttachment(bytes: Uint8Array): AttachmentCheck {
  if (bytes.length > MAX_ATTACHMENT_BYTES) return { ok: false, error: TOO_BIG };
  const type = sniffAttachmentType(bytes);
  if (!type) return { ok: false, error: NOT_A_FILE };
  return { ok: true, type, extension: EXTENSION[type] };
}

/** `retail/<companyId>/buying/<uuid>.<ext>`. */
export const attachmentPath = (companyId: string, uuid: string, extension: string) => `retail/${companyId}/buying/${uuid}.${extension}`;

/** The receipts the app ships for the demo shop (`public/demo/receipts/`), served from the app itself. */
export const SHIPPED_RECEIPTS = "/demo/receipts/";

/** Only a file this company uploaded here (or one the app ships, same origin) is kept against its records. */
export function isOwnUpload(companyId: string, url: string): boolean {
  if (url.startsWith(SHIPPED_RECEIPTS) && !url.includes("..")) return true;
  try {
    return new URL(url).pathname.replace(/^\/+/, "").startsWith(`retail/${companyId}/buying/`);
  } catch {
    return false;
  }
}

const KINDS: readonly string[] = Object.keys(EXTENSION);

/** Keeps one file against a record; refused (as the field's error) when it is not this company's upload. */
export async function recordAttachment(
  tx: Tx,
  actor: RetailAuditActor,
  input: { entityType: string; entityId: string; kind: RetailAttachmentKind; file: UploadedFile },
): Promise<{ id: string }> {
  const { file } = input;
  if (!isOwnUpload(actor.companyId, file.url) || !KINDS.includes(file.contentType) || !(file.size > 0) || file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentRefusal(NOT_A_FILE);
  }
  return tx.retailAttachment.create({
    data: {
      companyId: actor.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      kind: input.kind,
      url: file.url,
      name: file.name.trim().slice(0, 200) || "File",
      contentType: file.contentType,
      size: Math.round(file.size),
      addedById: actor.userId,
    },
    select: { id: true },
  });
}

export class AttachmentRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttachmentRefusal";
  }
}
