import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { MessageRefusal, reminderSourceFor } from "@/lib/retail/messages/preview";
import { messageInput, queueCustomerMessages } from "@/lib/retail/messages/queue";
import { requireRetailPermission } from "@/lib/retail/permissions";
import { requireRetailSession } from "../../_helpers";

/**
 * Message customers on WhatsApp (CUS-06, W-50): `{ purpose, audience, ids?,
 * about?, body, sendAt }` → 201 `{ data: { batchId, queued, sendAt, waiting } }`.
 * An offer needs `retail.customers:update`; a reminder its source's grant
 * (lay-bys `retail.laybys:update`, accounts `retail.accounts:update`).
 * Nobody it reaches is a 409; a placeholder that does not fill in is 400
 * under `msg`, a time already past 400 under `when`. With WhatsApp not
 * connected the messages wait in the outbox (`waiting`), nothing fails (C-04).
 */
export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  const parsed = messageInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Validation failed", 400, parsed.error.issues);

  try {
    const grant = parsed.data.purpose === "OFFER" ? (["retail.customers", "update"] as const) : reminderSourceFor(parsed.data.about).source.requires;
    const gate = requireRetailPermission(session, grant[0], grant[1]);
    if (gate) return gate;

    const actor = {
      companyId: session.user.companyId,
      userId: session.user.id,
      userName: session.user.name,
      userRole: session.user.role,
    };
    const data = await queueCustomerMessages(actor, parsed.data);
    return successResponse({ data }, 201);
  } catch (error) {
    if (error instanceof MessageRefusal) {
      return error.fieldErrors ? fieldErrorResponse(error.message, error.fieldErrors, error.status) : errorResponse(error.message, error.status);
    }
    throw error;
  }
}
