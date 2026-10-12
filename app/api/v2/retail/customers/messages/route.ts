import { NextRequest, NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { REMINDER_SOURCES } from "@/lib/retail/messages/audience";
import { MessageRefusal, reminderSourceFor } from "@/lib/retail/messages/preview";
import { messageInput, queueCustomerMessages } from "@/lib/retail/messages/queue";
import { retailPermissionDenial } from "@/lib/retail/permission-matrix";
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
const FIELD_OF: Record<string, string> = { body: "msg", sendAt: "when" };

function fieldWords(path: string): string {
  if (path === "body") return "Write the message.";
  if (path === "sendAt") return "Pick when it goes.";
  return "Pick who it goes to.";
}

const OFFER_GRANT = ["retail.customers", "update"] as const;
const purposeOf = messageInput.pick({ purpose: true, about: true });

type Session = Parameters<typeof requireRetailPermission>[0];
type Grant = readonly [Parameters<typeof requireRetailPermission>[1], Parameters<typeof requireRetailPermission>[2]];

/**
 * The right a message needs, read off its purpose: an offer's, or its reminder
 * source's. With no purpose to read, a role that may message nobody needs an
 * offer's (and is refused it); anyone else goes on to the body's own checks.
 */
function messageGrant(session: Session, raw: unknown): Grant | null {
  const head = purposeOf.safeParse(raw);
  if (head.success) {
    if (head.data.purpose === "OFFER") return OFFER_GRANT;
    try {
      return reminderSourceFor(head.data.about).source.requires;
    } catch (error) {
      if (!(error instanceof MessageRefusal)) throw error;
    }
  }
  const grants = [OFFER_GRANT, ...Object.values(REMINDER_SOURCES).map((source) => source!.requires)];
  return grants.every(([resource, action]) => retailPermissionDenial(session, resource, action)) ? OFFER_GRANT : null;
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;

  // The right is checked before the body is: the purpose names it (an offer's, or its reminder source's),
  // and with no purpose to read, a role that may message nobody is refused all the same.
  const raw = await request.json().catch(() => null);
  const grant = messageGrant(session, raw);
  const denied = grant ? requireRetailPermission(session, ...grant) : null;
  if (denied) return denied;

  const parsed = messageInput.safeParse(raw);
  if (!parsed.success) {
    // The sheet's own fields: the message under `msg`, the time under `when`, the rest under who it goes to.
    const fieldErrors = Object.fromEntries(
      parsed.error.issues.map((issue) => [FIELD_OF[String(issue.path[0] ?? "")] ?? "who", fieldWords(String(issue.path[0] ?? ""))]),
    );
    return fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the message.", fieldErrors);
  }

  try {
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
