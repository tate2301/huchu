import { NextRequest, NextResponse } from "next/server";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { importSuppliers } from "@/lib/retail/buying/supplier-import";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../../_helpers";

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Import suppliers (5.14): multipart `file`, `.xlsx` or `.csv`, every row
 * through New supplier's rules. `retail.suppliers:create`. `{ added, skipped:
 * [{ row, why }] }`; 400 "That file has no Name column.".
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "create");
  if (gate) return gate;

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fieldErrorResponse("Validation failed", { file: "Choose a spreadsheet." });
  if (file.size > MAX_BYTES) return fieldErrorResponse("Validation failed", { file: "Keep the file under 5 MB." });

  try {
    const result = await importSuppliers(buyingActor(session), { name: file.name, bytes: await file.arrayBuffer() });
    return successResponse(result);
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/suppliers/import");
  }
}
