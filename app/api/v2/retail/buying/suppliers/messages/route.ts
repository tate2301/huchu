import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fieldErrorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { buyingActor, buyingFailure } from "@/lib/retail/buying/routes";
import { messageInput, messageRecipients, messageSuppliers } from "@/lib/retail/buying/suppliers";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { parseRetailQuery } from "@/lib/retail/request";

import { requireRetailSession } from "../../../_helpers";

const recipientsQuery = z.object({
  ids: z
    .string()
    .default("")
    .transform((raw) => raw.split(",").filter(Boolean))
    .pipe(z.array(z.string().uuid("must be ids")).max(200, "at most 200")),
});

/**
 * Who a message to the ticked suppliers would reach (5.13's sub "3 ticked · 2
 * on WhatsApp"): each supplier and its WhatsApp number, or none.
 * `retail.suppliers:update`.
 */
export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "update");
  if (gate) return gate;

  const query = parseRetailQuery(request, recipientsQuery);
  if (query.response) return query.response;
  return successResponse({ data: await messageRecipients(session.user.companyId, query.data.ids) });
}

/**
 * "Message on WhatsApp" (5.13): `{ ids (≤200), message (1–1,000) }`, one
 * queued message each, to the rep who gets orders or the supplier's WhatsApp
 * number. `retail.suppliers:update`. `{ queued, skipped: [{ id, name, why }] }`.
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const gate = requireRetailPermission(session, "retail.suppliers", "update");
  if (gate) return gate;

  const parsed = messageInput.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first?.path[0] === "message" ? "message" : "ids";
    return fieldErrorResponse("Validation failed", { [field]: first?.message ?? "Check the message." });
  }

  const actor = buyingActor(session);
  try {
    const result = await prisma.$transaction((tx) => messageSuppliers(tx, actor, parsed.data));
    return successResponse(result);
  } catch (error) {
    return buyingFailure(error, "POST /api/v2/retail/buying/suppliers/messages");
  }
}
