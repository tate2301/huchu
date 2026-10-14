import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { operatorCan, type OperatorAction } from "@/lib/operators/roles";
import { findSession, OPERATOR_COOKIE } from "@/lib/operators/session";

/**
 * Who is signed in to the admin portal, read once per request.
 *
 * Only a session that has had its authenticator code counts. The secret and
 * the attempt counters stay behind: nothing a page renders needs them.
 */
export const getSignedInOperator = cache(async () => {
  const jar = await cookies();
  const session = await findSession(jar.get(OPERATOR_COOKIE)?.value);
  if (!session?.verifiedAt) return null;
  const { id, email, name, role } = session.operator;
  return { sessionId: session.id, id, email, name, role };
});

export type SignedInOperator = NonNullable<Awaited<ReturnType<typeof getSignedInOperator>>>;

/** For pages: the operator, or the sign-in page. */
export async function requireOperator(): Promise<SignedInOperator> {
  const operator = await getSignedInOperator();
  if (!operator) redirect("/admin/login");
  return operator;
}

export class OperatorRefusal extends Error {
  constructor(message = "Your role cannot do this.") {
    super(message);
  }
}

/**
 * For writes: the operator, if their role may do this. Throws otherwise — a
 * server action that reaches here without the right role was not offered the
 * control, so the refusal is a guard, not a message anyone should see often.
 */
export async function requireOperatorFor(action: OperatorAction): Promise<SignedInOperator> {
  const operator = await getSignedInOperator();
  if (!operator) throw new OperatorRefusal("Your session has ended. Sign in again.");
  if (!operatorCan(operator.role, action)) throw new OperatorRefusal();
  return operator;
}

/** Where a request came from, for the session record. */
export async function requestMeta() {
  const list = await headers();
  return {
    ipAddress: list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || null,
    userAgent: list.get("user-agent"),
  };
}

/**
 * A path inside the portal to go to after signing in, or the portal's home.
 * Anything else — another host, a protocol-relative URL — is dropped, so the
 * sign-in page cannot be used to bounce someone elsewhere.
 */
export function safeAdminPath(value: FormDataEntryValue | string | null | undefined): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (!path.startsWith("/admin") || path.startsWith("//") || path.startsWith("/admin/login")) return "/admin";
  return path;
}
