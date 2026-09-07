import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { sumMoney, toNumberOrZero } from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";
import { requireRetailPermission } from "../../../../../permissions";
import { parseRetailParams, retailIdParams } from "../../../../../request";
import { requireRetailSession } from "../../_helpers";

/**
 * One shift, with everything that happened at that drawer.
 *
 * R-4.3. `/retail/shifts/{id}` had no route to read from — the list carried a
 * hundred shifts and a close dialog, and nothing could open one. That is the
 * screen a manager wants on a Monday morning when Friday's till was short: what
 * the float was, what went through it, what was banked mid-shift, and what the
 * count came to.
 *
 * ## Three reads, not one nested include
 *
 * The sales, the cash movements and the shift itself are fetched separately.
 * `RetailSale` has a required relation to `InventoryItem` on its lines, and a
 * nested include that hits one missing row makes Prisma throw on the whole
 * query — the same reason `lib/retail/shelf-listing.ts` fetches its stock rows
 * apart from its products. A manager investigating a variance should not be
 * shown nothing because one line's item was deleted.
 *
 * ## `retail.cash-control`, not `retail.sell`
 *
 * This is somebody else's drawer. A cashier reaches their own through
 * `pos/current-shift`, which is self-scoped; this is the back-office view of
 * every register, and the matrix keeps those apart deliberately.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.cash-control", "view");
  if (gate) return gate;

  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;

  const companyId = session.user.companyId;
  const shift = await prisma.retailShift.findFirst({
    where: { id: path.data.id, companyId },
  });
  if (!shift) {
    return errorResponse("Shift not found", 404);
  }

  const [site, sales, movements] = await Promise.all([
    prisma.site.findFirst({
      where: { id: shift.siteId, companyId },
      select: { id: true, name: true, code: true },
    }),
    prisma.retailSale.findMany({
      where: { shiftId: shift.id, companyId },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        saleNo: true,
        saleType: true,
        status: true,
        totalAmount: true,
        postedAt: true,
        customerName: true,
        payments: { select: { tenderType: true, amount: true, baseAmount: true } },
      },
    }),
    prisma.retailCashMovement.findMany({
      where: { shiftId: shift.id, companyId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        reasonCode: true,
        amount: true,
        currency: true,
        baseAmount: true,
        reason: true,
        recordedByName: true,
        createdAt: true,
      },
    }),
  ]);

  /*
    Takings sums **every row on the shift**, not just the posted ones, and the
    difference is not academic.

    Voiding a sale writes a new `VOID` row at minus the amount and flips the
    original to `VOIDED`. Filtering on `status === "POSTED"` therefore keeps the
    negative reversal and drops the positive sale it cancels: a shift whose only
    activity was one $2.40 sale and its void reported takings of **−$2.40**,
    when the drawer netted exactly nothing. Caught by driving this page against
    a real shift, where a screen reading "Takings −$2.40 · 0 sales, 1 reversal"
    made no sense on a till that had taken money and given it back.

    The ledger is self-balancing: a void is a negative row against a positive
    row that stays in the table. Summing all of them is the arithmetic the
    shifts list has always done, and this now agrees with it.
  */
  const settled = sales.filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED");
  const reversals = sales.filter((sale) => sale.saleType !== "SALE" && sale.status === "POSTED");

  /*
    The tender mix is summed in `Decimal` and converted once, at the wire.
    `baseAmount` rather than `amount`, because a drawer holding ZWG notes and
    USD notes is reconciled in one currency and adding the face values of two
    would produce a number that means nothing. Every row again, for the reason
    above — a voided sale's tender and the void's negative tender cancel.
  */
  const tenderMix: Record<string, number> = {};
  const byTender = new Map<string, (typeof sales)[number]["payments"]>();
  for (const sale of sales) {
    for (const payment of sale.payments) {
      const held = byTender.get(payment.tenderType) ?? [];
      held.push(payment);
      byTender.set(payment.tenderType, held);
    }
  }
  for (const [tender, payments] of byTender) {
    tenderMix[tender] = toNumberOrZero(sumMoney(payments.map((payment) => payment.baseAmount)));
  }

  return successResponse({
    data: {
      ...shift,
      site,
      /** Sales that still stand. A voided one is counted as a reversal, not a sale. */
      saleCount: settled.length,
      reversalCount: reversals.length,
      salesValue: toNumberOrZero(sumMoney(sales.map((sale) => sale.totalAmount))),
      tenderMix,
      sales,
      cashMovements: movements,
    },
  });
}
