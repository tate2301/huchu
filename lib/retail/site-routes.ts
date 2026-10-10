import { NextResponse } from "next/server";
import { z } from "zod";

import { markActivityFailed } from "@/lib/activity/context";
import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { canRetailSessionDo, type SessionLike } from "@/lib/retail/permission-matrix";
import { SiteRefusal, siteFieldErrors, type SiteActor } from "@/lib/retail/sites";

/**
 * What every `/api/v2/retail/sites/**` route shares: the actor off the
 * session (with whether it may see cost), the body checked into
 * `{ error, fieldErrors }`, and refusals answered with their status — under a
 * field, or as `{ error, code }` for a rule (PLAN_LIMIT, DEFAULT_SITE,
 * HAS_STOCK, SHIFT_OPEN).
 */

type RouteSession = SessionLike & {
  user: { companyId: string; id: string; name?: string | null; role?: string | null };
};

export function siteActor(session: RouteSession): SiteActor {
  return {
    companyId: session.user.companyId,
    userId: session.user.id,
    userName: session.user.name ?? null,
    userRole: session.user.role ?? null,
    canSeeCost: canRetailSessionDo(session, "retail.catalog", "view-cost"),
  };
}

export async function parseSiteBody<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return { data: parsed.data };
  const fieldErrors = siteFieldErrors(parsed.error);
  return { response: fieldErrorResponse(Object.values(fieldErrors)[0] ?? "Check the fields.", fieldErrors) };
}

export function siteFailure(error: unknown, where: string): NextResponse {
  if (error instanceof SiteRefusal) {
    if (error.opts.field) return fieldErrorResponse(error.message, { [error.opts.field]: error.message }, error.status);
    if (error.opts.code) {
      markActivityFailed();
      return NextResponse.json({ error: error.message, code: error.opts.code }, { status: error.status });
    }
    return errorResponse(error.message, error.status);
  }
  console.error(`[API] ${where} error:`, error);
  return errorResponse("That did not work. Nothing was changed; try again.");
}

export const isSiteId = (id: string) => z.string().uuid().safeParse(id).success;
