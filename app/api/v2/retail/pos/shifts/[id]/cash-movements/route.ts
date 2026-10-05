/**
 * The till's cash drops, under the till's feature key.
 *
 * S-7.9. Same handlers as `app/api/v2/retail/shifts/[id]/cash-movements`, on a
 * path that resolves to `retail.pos` instead of `retail.shifts`.
 *
 * ── Why a second path rather than a second gate ────────────────────────────
 *
 * A cashier dropping $20 to the safe got **403 `Feature disabled:
 * retail.shifts`**, and everything about that was working as designed except
 * the outcome:
 *
 *  - the tenant *has* `retail.shifts` enabled;
 *  - but `getEffectiveFeaturesForUser` filters the company's features through
 *    the caller's role template, and a `CASHIER` is not given `retail.shifts` —
 *    correctly, because that key guards the back-office shifts screen, which is
 *    a manager's view of *every* cashier's drawer;
 *  - and `route-registry.ts` maps the whole `/api/v2/retail/shifts` prefix to
 *    that key.
 *
 * So a till function was inheriting a back-office entitlement purely from where
 * its URL happened to sit. The registry matches on prefixes and picks the
 * longest, and the path it would need to single out — the shifts prefix, then
 * a shift id, then `cash-movements` — has a dynamic segment in the middle, so
 * no prefix can express it. Giving `CASHIER` the `retail.shifts` default would
 * have fixed the symptom by handing every cashier the manager's shift screen.
 *
 * Moving the URL is the honest fix: recording a cash movement on your own
 * drawer is part of running a till, and `pos-cash-movement-view.tsx` — mounted
 * on the POS shift screen — is the only caller in the repository.
 *
 * The handlers themselves are untouched and unduplicated. They still decide
 * *who* may act: your own drawer is `retail.sell`, anybody else's is
 * `retail.cash-control`. This file changes which feature the door is keyed to,
 * nothing else. The old path stays for the back office.
 */

import type { NextRequest, NextResponse } from "next/server";

import { refuseShiftElsewhere, requirePosDevice } from "@/lib/retail/devices";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { requireRetailSession } from "../../../../_helpers";
import { GET as drawerGet, POST as drawerPost } from "../../../../shifts/[id]/cash-movements/route";

/*
  SET-04: at the till, on a till, on this till's shift. The device is checked
  first (its key is the credential for which till this is) against the
  session's shop, then that the shift is on this till; the handlers then check
  the person.
*/
type Context = Parameters<typeof drawerGet>[1];

async function refuseShiftElsewhereFromRequest(request: NextRequest, context: Context): Promise<NextResponse | null> {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) return response as NextResponse;
  const { device, response: deviceResponse } = await requirePosDevice(request, session);
  if (deviceResponse) return deviceResponse;
  const path = await parseRetailParams(context.params, retailIdParams);
  if (path.response) return path.response;
  return refuseShiftElsewhere(device, path.data.id);
}

export async function GET(request: NextRequest, context: Context) {
  return (await refuseShiftElsewhereFromRequest(request, context)) ?? drawerGet(request, context);
}

export async function POST(request: NextRequest, context: Context) {
  return (await refuseShiftElsewhereFromRequest(request, context)) ?? drawerPost(request, context);
}
