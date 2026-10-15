import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { decidePrices, removePrice } from "@/lib/crm/knowledge/store";
import { prisma } from "@/lib/prisma";

import { requireCrmCapability } from "../../../_helpers";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(500), keep: z.boolean() }),
  z.object({ remove: z.string().uuid() }),
]);

/** Keeps the prices Vane found (or lets them go), or removes one price that is wrong. Vane quotes only from kept prices. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    if (!(await requireCrmCapability(session, "settings.manage"))) return errorResponse("Pricing the knowledge base is a CRM settings change", 403);
    const docId = (await params).id;
    const body = bodySchema.parse(await request.json());
    const companyId = session.user.companyId;
    const changed = "remove" in body ? await removePrice(prisma, companyId, docId, body.remove) : await decidePrices(prisma, companyId, docId, body.ids, body.keep);
    return successResponse({ changed });
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Say which prices", 400);
    console.error("[API] POST /api/v2/crm/knowledge/[id]/prices error:", error);
    return errorResponse("Could not change the prices");
  }
}
