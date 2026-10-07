import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse } from "@/lib/api-response";
import { importFailure } from "@/lib/retail/import/routes";
import { discardImport, loadImportPage } from "@/lib/retail/import/store";
import { IMPORT_TABS, NOT_FOUND } from "@/lib/retail/import/words";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

const tabOf = (value: string | null) => z.enum(IMPORT_TABS).catch("fix").parse(value ?? "fix");

/** One import, a tab of its rows at a time (10-setup 4.11): `{ data: ImportPage }`. `retail.catalog:create`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return errorResponse(NOT_FOUND, 404);
  const data = await loadImportPage(session.user.companyId, path.data.id, tabOf(request.nextUrl.searchParams.get("tab")));
  if (!data) return errorResponse(NOT_FOUND, 404);
  return successResponse({ data });
}

/** "Start again": the import is thrown away and its rows go. 204; 409 once imported. `retail.catalog:create`. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return errorResponse(NOT_FOUND, 404);
  try {
    await discardImport(session.user.companyId, path.data.id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return importFailure(error, "DELETE /api/v2/retail/products/import/[id]");
  }
}
