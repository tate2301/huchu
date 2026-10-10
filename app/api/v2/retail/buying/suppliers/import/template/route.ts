import { NextRequest, NextResponse } from "next/server";

import { importTemplate } from "@/lib/retail/buying/supplier-import";
import { requireRetailPermission } from "@/lib/retail/permissions";

import { requireRetailSession } from "../../../../_helpers";

/** "Download the template" (5.14): the import's columns as an `.xlsx`. `retail.suppliers:create`. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "create");
  if (gate) return gate;

  const bytes = await importTemplate();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="suppliers.xlsx"',
    },
  });
}
