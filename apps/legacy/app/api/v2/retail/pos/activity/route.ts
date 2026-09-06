/**
 * What this cashier's till has done lately.
 *
 * S-7.6, contract surface 16. `docs/design-system/portals/pos.html` puts an
 * *Audit log* on the till: filter chips, a row per event, an actor and a signed
 * amount. `lib/retail/till-activity.ts` builds the timeline and its header
 * carries the honest caveat — this is a **derived view of domain rows**, not a
 * tamper-evident audit trail. R-3.3 has since built the real trail in
 * `lib/retail/audit.ts`; this screen still reads the domain rows, because a
 * cashier's own week and an auditor's append-only chain are different documents
 * and merging them would serve neither.
 *
 * ── Scope: this cashier, this week ─────────────────────────────────────────
 *
 * Not the whole shop. The POS portal admits `CASHIER` and `POS_CASHIER` and
 * nobody else — `canAccessPosPortal` in `lib/retail/pos-host.ts` — so there is
 * no manager at this screen doing a floor-wide review; there is one person
 * asking what happened at their own till. Widening it to every register would
 * hand each cashier a log of their colleagues' takings for no use case anyone
 * has.
 *
 * Seven days rather than today, because the question that brings somebody to
 * this screen is usually about a shift that has already been cashed up.
 */

import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse } from "@/lib/api-response";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "@/lib/retail/permissions";
import {
  buildTillActivity,
  countTillActivity,
  type TillActivityMovementRow,
  type TillActivitySaleRow,
} from "@/lib/retail/till-activity";
import { requireRetailSession } from "../../_helpers";

/** How far back the timeline reaches, and the most shifts it will span. */
const WINDOW_DAYS = 7;
const MAX_SHIFTS = 20;

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // The caller's own activity, so the gate is the one they already hold to sell.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  try {
    const companyId = session.user.companyId;
    const cashierId = session.user.id;
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

    const shifts = await prisma.retailShift.findMany({
      where: { companyId, cashierId, openedAt: { gte: since } },
      orderBy: { openedAt: "desc" },
      take: MAX_SHIFTS,
      select: {
        id: true,
        shiftNo: true,
        registerName: true,
        cashierName: true,
        openingFloat: true,
        countedCash: true,
        variance: true,
        openedAt: true,
        closedAt: true,
      },
    });

    const shiftIds = shifts.map((shift) => shift.id);
    const shiftNoById = new Map(shifts.map((shift) => [shift.id, shift.shiftNo]));

    const [sales, movements] = await Promise.all([
      /**
       * By cashier and by window, not by shift.
       *
       * A sale replayed off the offline queue can land with `shiftId` null — the
       * shift it was rung during may have been cashed up before the line came
       * back. Filtering on `shiftId in (…)` would drop exactly the rows a
       * cashier came here to look for.
       */
      prisma.retailSale.findMany({
        where: { companyId, cashierId, createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          saleNo: true,
          saleType: true,
          baseAmount: true,
          totalAmount: true,
          currency: true,
          cashierName: true,
          customerName: true,
          overrideReason: true,
          postedAt: true,
          createdAt: true,
          shiftId: true,
        },
      }),
      shiftIds.length === 0
        ? Promise.resolve([])
        : prisma.retailCashMovement.findMany({
            where: { companyId, shiftId: { in: shiftIds } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              type: true,
              baseAmount: true,
              reasonCode: true,
              reason: true,
              recordedByName: true,
              createdAt: true,
              shiftId: true,
            },
          }),
    ]);

    const entries = buildTillActivity({
      sales: sales.map(
        ({ shiftId, ...sale }): TillActivitySaleRow => ({
          ...sale,
          shiftNo: shiftId ? shiftNoById.get(shiftId) ?? null : null,
        }),
      ),
      movements: movements.map(
        ({ shiftId, ...movement }): TillActivityMovementRow => ({
          ...movement,
          shiftNo: shiftNoById.get(shiftId) ?? null,
        }),
      ),
      shifts,
    });

    return successResponse({
      data: {
        entries,
        counts: countTillActivity(entries),
        windowDays: WINDOW_DAYS,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/retail/pos/activity error:", error);
    return errorResponse("Failed to read this till's activity");
  }
}
