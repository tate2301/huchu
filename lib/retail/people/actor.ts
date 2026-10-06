import { getHostHeaderFromRequestHeaders } from "@/lib/platform/tenant";
import type { RetailAuditActor } from "@/lib/retail/audit";
import { retailRoleKey, type SessionLike } from "@/lib/retail/permission-matrix";

import type { Viewer } from "./view";

/**
 * Who is acting on People: the audit actor, the role key the matrix measures
 * them with (Corelith support during a support session), and the address the
 * request came in on, which the join link is built from.
 */
export type PeopleActor = RetailAuditActor & {
  roleKey: string | null;
  /** The request's URL: the join link goes on this shop's host. */
  requestUrl: string;
};

type ActorSession = SessionLike & {
  user: { id: string; companyId: string; name?: string | null; role?: string | null; supportSessionId?: string | null };
};

/**
 * The address the person typed, not the one the server was reached on: the
 * shop's host (with a preview's nominated host), so a join link built on it
 * opens on the shop.
 */
export function requestAddress(request: Request): string {
  const url = new URL(request.url);
  const host = getHostHeaderFromRequestHeaders(request.headers) ?? url.host;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || url.protocol.replace(":", "");
  return `${proto}://${host}${url.pathname}`;
}

export function peopleActor(session: ActorSession, requestUrl: string): PeopleActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
    roleKey: retailRoleKey(session),
    requestUrl,
  };
}

export function viewerOf(actor: PeopleActor): Viewer {
  return { userId: actor.userId, roleKey: actor.roleKey };
}
