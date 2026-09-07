import { NextRequest, NextResponse } from "next/server";
import { errorResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { ensureSiteAccess } from "../../../registers";
export {
  ensureInventoryItemAccess,
  ensureLocationAccess,
  ensureRetailRegisterAccess,
  ensureSiteAccess,
  getAccountingStatusForSource,
  getPosSupportedPromotionTypes,
  isPosSupportedPromotionType,
  normalizeRetailPostingPayments,
  postRetailJournal,
  upsertRetailRegister,
  type RetailAccountingResult,
  type RetailAccountingStatus,
} from "../../../registers";

export type RetailSession = Awaited<ReturnType<typeof validateSession>> extends infer TResult
  ? TResult extends NextResponse
    ? never
    : TResult extends { session: infer TSession }
      ? TSession
      : never
  : never;

export async function requireRetailSession(request: NextRequest) {
  const sessionResult = await validateSession(request);
  if (sessionResult instanceof NextResponse) {
    return { response: sessionResult, session: null as RetailSession | null };
  }
  return { response: null, session: sessionResult.session as RetailSession };
}

/**
 * The site a retail request is about, asked for only when it is genuinely a
 * question.
 *
 * Seven retail routes took `siteId: z.string().uuid()` as required, so a bottle
 * store with one shop had to name its branch on every sale, shift, order and
 * count — and the shift dialog could not be submitted until the cashier picked
 * the single item in a list of one. That is the trap the vertical-building doc
 * names outright: *do not gate a lookup on a narrowing field*. A site narrows a
 * register; it is not a prerequisite for having one.
 *
 *  - given a site, it is validated exactly as before;
 *  - given none, a tenant with exactly one active site gets that site;
 *  - given none with several sites, the caller is told to choose, because now it
 *    really is a question;
 *  - given none with no sites at all, the caller is told to create one, which is
 *    a setup problem and should not read as "invalid site".
 *
 * Returns the site, or a `NextResponse` to return as-is.
 */
export async function resolveRetailSite(
  companyId: string,
  siteId?: string | null,
): Promise<
  { site: Awaited<ReturnType<typeof ensureSiteAccess>>; response: null } | { site: null; response: NextResponse }
> {
  if (siteId) {
    const site = await ensureSiteAccess(companyId, siteId);
    if (!site) return { site: null, response: retailValidationError("Invalid site", 400) };
    return { site, response: null };
  }

  const active = await prisma.site.findMany({
    where: { companyId, isActive: true },
    select: { id: true, companyId: true, isActive: true, name: true, code: true },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (active.length === 0) {
    return {
      site: null,
      response: retailValidationError(
        "This workspace has no active site yet. Add one in Setup before trading.",
        400,
      ),
    };
  }
  if (active.length > 1) {
    return {
      site: null,
      response: retailValidationError(
        "This workspace has more than one site — say which one this is for.",
        400,
      ),
    };
  }
  return { site: active[0], response: null };
}

export function retailValidationError(message: string, status = 400, details?: unknown) {
  return errorResponse(message, status, details);
}
