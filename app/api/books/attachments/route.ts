import { randomUUID } from "node:crypto";

import { put } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor } from "@/lib/books/core";
import { attachmentPath, checkAttachment } from "@/lib/retail/buying/attachments";
import { isBlobStorageConfigured } from "@/lib/uploads/storage";

/**
 * A file for a Books record: a supplier's invoice as a photo or PDF, a slip
 * for a claim or a voucher. Checked by its first bytes (PDF or a picture, 10
 * MB at most) and stored where the buying screens keep theirs; answers
 * `{ url, name, contentType, size }`, and the record's own route keeps it.
 * Anyone signed in may add a file: a claim is everyone's to make.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const actor = await booksActor(sessionResult.session);
    if (actor.signInAs?.mode === "LOOK") return errorResponse("You signed in to look only, so nothing can be added.", 403);
    if (!isBlobStorageConfigured()) return errorResponse("Files cannot be kept on this server yet: file storage is not set up.", 503);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return errorResponse("No file was attached", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkAttachment(bytes);
    if (!check.ok) return errorResponse(check.error, 400);
    const uploaded = await put(attachmentPath(actor.companyId, randomUUID(), check.extension), new Blob([bytes], { type: check.type }), { access: "public", contentType: check.type });
    return successResponse({ url: uploaded.url, name: (file.name || `File.${check.extension}`).slice(0, 200), contentType: check.type, size: bytes.length }, 201);
  } catch (error) {
    console.error("[API] POST /api/books/attachments error:", error);
    return errorResponse("That file could not be saved");
  }
}
