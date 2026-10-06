import { NextRequest, NextResponse } from "next/server";

import { successResponse } from "@/lib/api-response";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { productNewContext } from "@/lib/retail/products/context";

import { requireRetailSession } from "../../_helpers";

/** What the New product sheet opens with (20-products 4.2). `retail.catalog:create`. */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.catalog", "create");
  if (gate) return gate;

  return successResponse({ data: await productNewContext(session.user.companyId) });
}
