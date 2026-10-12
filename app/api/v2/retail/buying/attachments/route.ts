import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { attachmentPath, checkAttachment } from "@/lib/retail/buying/attachments";
import { canRetailSessionDo } from "@/lib/retail/permission-matrix";

import { requireRetailSession } from "../../_helpers";

/**
 * A file for a buying record (40-buying 4.4): a requisition's quote or
 * receipt, a bill, a delivery note, a photo. PDF or a picture, 10 MB at most,
 * checked by its first bytes. Answers `{ url, name, contentType, size }`; the
 * service that owns the record keeps it against the record.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const allowed =
    canRetailSessionDo(session, "retail.requisitions", "create") ||
    canRetailSessionDo(session, "retail.purchasing", "receive") ||
    canRetailSessionDo(session, "retail.bills", "create");
  if (!allowed) return errorResponse("Your role cannot add files to buying records", 403);

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return errorResponse("File storage is not configured for this deployment", 503);
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse("No file was attached", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkAttachment(bytes);
    if (!check.ok) return errorResponse(check.error, 400);

    const uploaded = await put(attachmentPath(session.user.companyId, randomUUID(), check.extension), new Blob([bytes], { type: check.type }), {
      access: "public",
      contentType: check.type,
    });
    const name = (file.name || `File.${check.extension}`).slice(0, 200);
    return successResponse({ data: { url: uploaded.url, name, contentType: check.type, size: bytes.length } });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/buying/attachments error:", error);
    return errorResponse("That file could not be saved");
  }
}
