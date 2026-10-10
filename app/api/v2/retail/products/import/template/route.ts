import { NextRequest, NextResponse } from "next/server";

import { productsTemplate, TEMPLATE_FILE } from "@/lib/retail/import/template";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../../_helpers";

/** "Download the template" (W-08): the eight columns under a note, the shop's categories on a second sheet. `retail.catalog:create`. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  const bytes = await productsTemplate(session.user.companyId);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${TEMPLATE_FILE}"`,
    },
  });
}
