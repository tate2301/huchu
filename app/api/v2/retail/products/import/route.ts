import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { parseSheet } from "@/lib/retail/import/parse";
import { importFailure } from "@/lib/retail/import/routes";
import { createImport } from "@/lib/retail/import/store";
import { MAX_BYTES, TOO_BIG } from "@/lib/retail/import/words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { productActor } from "@/lib/retail/products/routes";

import { requireRetailSession } from "../../_helpers";

/**
 * Upload a products spreadsheet (W-08, SET-11): multipart `file`, `.xlsx` or
 * `.csv`, up to 5 MB and 5,000 rows. Every row is stored as typed, checked
 * and matched; nothing reaches Products until the import is committed.
 * `retail.catalog:create`. 201 `{ data: { id } }`; 400 in words.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorResponse("Choose a spreadsheet.", 400);
  if (file.size > MAX_BYTES) return errorResponse(TOO_BIG, 400);

  try {
    const rows = await parseSheet(Buffer.from(await file.arrayBuffer()), file.name);
    const created = await createImport(productActor(session), file.name, rows);
    return successResponse({ data: created }, 201);
  } catch (error) {
    return importFailure(error, "POST /api/v2/retail/products/import");
  }
}
