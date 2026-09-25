import { after } from "next/server";

import type { AuthenticatedSession } from "@/lib/auth-core/types";

import type { ActivityRequest } from "./context";
import { flushActivity } from "./flush";

/**
 * Name who is making the request, and write its changes once it is answered.
 *
 * `after()` runs the flush once the response has been sent. Outside a request
 * scope — a test calling a handler directly — it throws, and the changes are
 * simply not written: there is no request to have been made by anybody.
 */
export function attachActivityActor(record: ActivityRequest, session: AuthenticatedSession) {
  if (record.actorId) return;
  record.companyId = session.user.companyId ?? null;
  record.actorId = session.user.id;
  record.actorName = session.user.name ?? session.user.email ?? null;
  record.actorRole = session.user.role ?? null;

  try {
    after(() => flushActivity(record));
  } catch {
    // Not in a request scope.
  }
}
