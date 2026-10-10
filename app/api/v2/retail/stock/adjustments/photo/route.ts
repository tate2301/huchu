import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";

import { errorResponse, successResponse } from "@/lib/api-response";
import { checkCatalogImage } from "@/lib/retail/catalog-image";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { adjustmentPhotoFolder } from "@/lib/retail/stock/adjustments";

import { requireRetailSession } from "../../../_helpers";

/**
 * A photo of what broke, for Adjust stock's "Photo" (W-23): multipart `file`
 * → `{ data: { url } }`. `retail.adjustments:create`, the same people who
 * adjust. The adjustment saves the url on its movement (`photoUrl`); this
 * only stores the picture, under the company's own prefix.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.adjustments", "create");
  if (gate) return gate;

  if (!process.env.BLOB_READ_WRITE_TOKEN?.trim()) {
    return errorResponse("Image storage is not configured for this deployment", 503);
  }

  try {
    const file = (await request.formData()).get("file");
    if (!(file instanceof File)) return errorResponse("No image was attached", 400);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = checkCatalogImage({ bytes, declaredType: file.type });
    if (!check.ok) return errorResponse(check.error, 400);

    const path = `${adjustmentPhotoFolder(session.user.companyId)}/${randomUUID()}.${check.extension}`;
    const uploaded = await put(path, new Blob([bytes], { type: check.type }), { access: "public", contentType: check.type });
    return successResponse({ data: { url: uploaded.url } });
  } catch (error) {
    console.error("[API] POST /api/v2/retail/stock/adjustments/photo error:", error);
    return errorResponse("That photo could not be saved");
  }
}
