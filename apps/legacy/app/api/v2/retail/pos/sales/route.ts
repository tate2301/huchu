import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma, RetailSaleStatus, RetailSaleType } from "@corelithzw/db";
import { z } from "zod";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { atLeast, money, sumMoney, toNumber, toNumberOrZero } from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";
import {
  getCustomerLoyaltyBalance,
  getLoyaltyTier,
  LOYALTY_MAX_REDEEM_SHARE,
  LOYALTY_REDEEM_POINTS_PER_USD,
  parseLoyaltyRedeemPoints,
} from "@corelithzw/module-sell/loyalty";
import { canRetailRoleDo, canSeeRetailCostPrice, requireRetailPermission } from "@corelithzw/module-sell/permissions";
import { getRetailTenderPolicy, validateTenderReferences } from "@corelithzw/module-sell/tender-policy";
import { calculateRetailCheckout } from "@corelithzw/module-sell/checkout";
import { OFFLINE_REPLAY_NOTE_MARKER } from "@corelithzw/module-sell/offline-queue-verdict";
import { reviewReplayedPrices } from "@corelithzw/module-sell/replay-price-review";
import { loadSellableProducts } from "@corelithzw/module-sell/shelf-listing";
import { resolveShelfPrices } from "@corelithzw/module-sell/shelf-pricing";
import {
  resolveRetailSite,
  getPosSupportedPromotionTypes,
  isPosSupportedPromotionType,
  requireRetailSession,
} from "../../_helpers";
import { createRetailSaleTransaction } from "@corelithzw/module-sell/transactions";

const saleLineSchema = z.object({
  /**
   * S-4b — a `Product.id`. It was a `RetailCatalogItem.id`; the item master moved
   * and the till's identity moved with it.
   */
  productId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
});

const salePaymentSchema = z.object({
  tenderType: z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]),
  amount: z.number().positive(),
  reference: z.string().max(120).optional().nullable(),
});

const managerOverrideSchema = z
  .object({
    managerUserId: z.string().uuid().optional(),
    managerEmail: z.string().email().optional(),
    managerPassword: z.string().min(1).max(200),
    reason: z.string().max(240).optional().nullable(),
  })
  .refine((value) => Boolean(value.managerUserId || value.managerEmail), {
    message: "Manager approver is required",
    path: ["managerUserId"],
  });

const saleSchema = z.object({
  saleNo: z.string().min(1).max(50).optional(),
  /**
   * S-7.7 — the till's key for one checkout attempt.
   *
   * The POS sends this and *not* `saleNo`, so the receipt gets a readable
   * `S-005080` off `reserveIdentifier` while a replay of the same attempt still
   * returns the existing sale instead of charging twice. `saleNo` stays
   * accepted for callers that genuinely want to name a sale.
   */
  clientRef: z.string().min(1).max(80).optional(),
  shiftId: z.string().uuid(),
  siteId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional().nullable(),
  customerName: z.string().max(200).optional().nullable(),
  customerPhone: z.string().max(40).optional().nullable(),
  customerEmail: z.string().email().max(200).optional().nullable(),
  loyaltyRedemptionPoints: z.number().int().min(0).optional(),
  notes: z.string().max(500).optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  overrideReason: z.string().max(240).optional().nullable(),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  managerOverride: managerOverrideSchema.optional(),
  promotionId: z.string().uuid().optional().nullable(),
  items: z.array(saleLineSchema).min(1),
  payments: z.array(salePaymentSchema).min(1),
  /**
   * S-7.3. When the till rang this sale, set only by the offline replay.
   *
   * Its presence is what makes a sale a *replay* rather than a sale being rung
   * now, and that distinction decides which price rule applies — see the
   * `reviewReplayedPrices` block below. A live till never sends it.
   */
  offlineCreatedAt: z.string().datetime().optional(),
  /** S-3. When the device's price snapshot was resolved, if it carries a stamp. */
  pricedAt: z.string().datetime().optional(),
});

type SaleListItem = Prisma.RetailSaleGetPayload<{
  include: { lines: true; payments: true };
}>;

function round(value: number) {
  return Number(value.toFixed(2));
}

function inPromotionWindow(promotion: {
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  const now = new Date();
  if (promotion.startsAt && promotion.startsAt > now) return false;
  if (promotion.endsAt && promotion.endsAt < now) return false;
  return true;
}

function normalizePhone(input: string | null | undefined) {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[^\d+]/g, "");
  if (normalized.length < 7) {
    throw new Error("Customer phone number looks invalid.");
  }
  return normalized;
}

function normalizeEmail(input: string | null | undefined) {
  if (!input) return null;
  const trimmed = input.trim().toLowerCase();
  return trimmed || null;
}

function mapSales(
  sales: SaleListItem[],
  sourceSaleMap: Map<string, string>,
  shiftMap: Map<string, { id: string; shiftNo: string; registerName: string; status: string; closedAt: Date | null }>,
  siteMap: Map<string, { id: string; name: string; code: string }>,
  // R-2.3. A cashier is entitled to their own sale history — reprinting a slip
  // and finding a sale to refund are the job. What they are not entitled to is
  // what the shop paid, which rides along on every line as `costUnit` and
  // `costTotal`. No door check can express that, because the row is allowed and
  // two of its fields are not; the decision has to come down into the shaping.
  showCost: boolean,
) {
  return sales.map((sale) => {
    const shift = sale.shiftId ? shiftMap.get(sale.shiftId) ?? null : null;
    const site = siteMap.get(sale.siteId) ?? null;
    return {
    id: sale.id,
    saleNo: sale.saleNo,
    saleType: sale.saleType,
    status: sale.status,
    shiftId: sale.shiftId,
    shiftNo: shift?.shiftNo ?? null,
    shiftStatus: shift?.status ?? null,
    shiftClosedAt: shift?.closedAt ?? null,
    registerName: shift?.registerName ?? null,
    siteId: sale.siteId,
    site,
    cashierId: sale.cashierId,
    cashierName: sale.cashierName,
    customerName: sale.customerName,
    postedAt: sale.postedAt ?? sale.createdAt,
    // Numbers, not `Decimal`. A `Prisma.Decimal` serialises to a JSON *string*,
    // and every retail screen reads these straight into `.toFixed()` and chart
    // series. The column type changing must not change the wire contract.
    subtotal: toNumberOrZero(sale.subtotal),
    discountAmount: toNumberOrZero(sale.discountAmount),
    taxAmount: toNumberOrZero(sale.taxAmount),
    totalAmount: toNumberOrZero(sale.totalAmount),
    tenderedAmount: toNumber(sale.tenderedAmount),
    changeAmount: toNumber(sale.changeAmount),
    promotionCode: sale.promotionCode,
    overrideReason: sale.overrideReason,
    voidReason: sale.voidReason,
    sourceSaleId: sale.sourceSaleId,
    sourceSaleNo: sale.sourceSaleId ? sourceSaleMap.get(sale.sourceSaleId) ?? null : null,
    itemCount: toNumberOrZero(sumMoney(sale.lines.map((line) => money(line.quantity).abs()))),
    lineCount: sale.lines.length,
    tenderTypes: sale.payments.map((payment) => payment.tenderType),
    payments: sale.payments.map((payment) => ({
      ...payment,
      amount: toNumberOrZero(payment.amount),
    })),
    lines: sale.lines.map((line) => {
      // Spread first, then delete, so a cost field added to the model later is
      // withheld by default rather than leaking until somebody notices.
      const { costUnit, costTotal, ...rest } = line;
      const shaped = {
        ...rest,
        quantity: toNumberOrZero(line.quantity),
        unitPrice: toNumberOrZero(line.unitPrice),
        discountAmount: toNumberOrZero(line.discountAmount),
        taxAmount: toNumberOrZero(line.taxAmount),
        lineTotal: toNumberOrZero(line.lineTotal),
      };
      if (!showCost) return shaped;
      return {
        ...shaped,
        costUnit: toNumberOrZero(costUnit),
        costTotal: toNumberOrZero(costTotal),
      };
    }),
    notes: sale.notes,
    };
  });
}

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. The sales list. `showCost` below is the field-level half — a cashier
  // may see what a receipt totalled and not what the shop paid for it.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const shiftId = searchParams.get("shiftId")?.trim();
  const siteId = searchParams.get("siteId")?.trim();
  const search = searchParams.get("search")?.trim();
  const saleType = searchParams.get("saleType")?.trim();
  const status = searchParams.get("status")?.trim();
  const scope = searchParams.get("scope")?.trim();
  const cashierId = searchParams.get("cashierId")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "60"), 1), 200);
  /*
    R-3.2. The id of the last receipt already seen, not an offset.

    An offset shifts under a till that is still selling: page two skips a
    receipt page one already showed, or misses one entirely, and the shop reads
    that as the system losing sales. A cursor on `id` moves with the rows.
  */
  const cursor = searchParams.get("cursor")?.trim() || undefined;
  if (cursor && !/^[0-9a-f-]{36}$/i.test(cursor)) {
    return errorResponse("Invalid cursor", 400);
  }
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && Number.isNaN(fromDate.getTime())) {
    return errorResponse("Invalid from date", 400);
  }
  if (toDate && Number.isNaN(toDate.getTime())) {
    return errorResponse("Invalid to date", 400);
  }
  if (fromDate && toDate && fromDate > toDate) {
    return errorResponse("From date must be before to date", 400);
  }

  const effectiveCashierId =
    scope === "mine"
      ? session.user.id
      : cashierId && cashierId !== "all"
        ? cashierId === "me"
          ? session.user.id
          : cashierId
        : undefined;

  const saleTypeFilter =
    saleType && saleType !== "all"
      ? RetailSaleType[saleType as keyof typeof RetailSaleType]
      : undefined;
  if (saleType && saleType !== "all" && !saleTypeFilter) {
    return errorResponse(`Unknown sale type "${saleType}"`, 400);
  }

  const statusFilter =
    status && status !== "all"
      ? RetailSaleStatus[status as keyof typeof RetailSaleStatus]
      : undefined;
  if (status && status !== "all" && !statusFilter) {
    return errorResponse(`Unknown status "${status}"`, 400);
  }

  const where: Prisma.RetailSaleWhereInput = {
    companyId: session.user.companyId,
    ...(shiftId ? { shiftId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(saleTypeFilter ? { saleType: saleTypeFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(effectiveCashierId ? { cashierId: effectiveCashierId } : {}),
    ...(fromDate || toDate
      ? {
          postedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
  };

  if (search) {
    where.OR = [
      { saleNo: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { cashierName: { contains: search, mode: "insensitive" } },
      { lines: { some: { itemName: { contains: search, mode: "insensitive" } } } },
    ];
  }

  // One more than asked for, so `hasMore` is answered without a second
  // `count()` — a count against a table the till is writing to is both an extra
  // round trip and a number that can disagree with the rows beside it.
  const page = await prisma.retailSale.findMany({
    where,
    include: { lines: true, payments: true },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = page.length > limit;
  const sales = hasMore ? page.slice(0, limit) : page;
  const nextCursor = hasMore ? (sales[sales.length - 1]?.id ?? null) : null;

  const sourceIds = [...new Set(sales.map((sale) => sale.sourceSaleId).filter((value): value is string => Boolean(value)))];
  const sourceSales = sourceIds.length
    ? await prisma.retailSale.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, saleNo: true },
      })
    : [];
  const sourceSaleMap = new Map(sourceSales.map((sale) => [sale.id, sale.saleNo]));
  const shiftIds = [...new Set(sales.map((sale) => sale.shiftId).filter((value): value is string => Boolean(value)))];
  const [shifts, sites] = await Promise.all([
    shiftIds.length
      ? prisma.retailShift.findMany({
          where: { id: { in: shiftIds }, companyId: session.user.companyId },
          select: { id: true, shiftNo: true, registerName: true, status: true, closedAt: true },
        })
      : Promise.resolve([]),
    prisma.site.findMany({
      where: { id: { in: [...new Set(sales.map((sale) => sale.siteId))] } },
      select: { id: true, name: true, code: true },
    }),
  ]);
  const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  const mapped = mapSales(
    sales,
    sourceSaleMap,
    shiftMap,
    siteMap,
    canSeeRetailCostPrice(session.user.role),
  );
  const postedMapped = mapped.filter((sale) => sale.status === "POSTED");

  return successResponse({
    data: mapped,
    page: { limit, cursor: cursor ?? null, nextCursor, hasMore },
    filters: {
      shiftId: shiftId ?? null,
      siteId: siteId ?? null,
      saleType: saleType ?? null,
      status: status ?? null,
      scope: scope ?? null,
      cashierId: effectiveCashierId ?? null,
      from: fromDate?.toISOString() ?? null,
      to: toDate?.toISOString() ?? null,
      limit,
    },
    /*
      Over the rows returned, not over everything the filter matches.

      That was already true when this was capped at 60 and nothing said so. It
      is stated now because a caller that pages will otherwise add four pages of
      "gross sales" together and get one day's takings counted four times.
    */
    summary: {
      grossSales: toNumberOrZero(
        sumMoney(
          postedMapped
            .filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED")
            .map((sale) => sale.totalAmount),
        ),
      ),
      refundValue: toNumberOrZero(
        sumMoney(
          postedMapped
            .filter((sale) => sale.saleType === "REFUND" && sale.status === "POSTED")
            .map((sale) => sale.totalAmount),
        ).abs(),
      ),
      voidValue: toNumberOrZero(
        sumMoney(
          postedMapped
            .filter((sale) => sale.saleType === "VOID" && sale.status === "POSTED")
            .map((sale) => sale.totalAmount),
        ).abs(),
      ),
      netSales: toNumberOrZero(sumMoney(postedMapped.map((sale) => sale.totalAmount))),
    },
  });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = saleSchema.parse(body);
    const { site, response: siteResponse } = await resolveRetailSite(
      session.user.companyId,
      input.siteId,
    );
    if (siteResponse) return siteResponse;
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const shift = await prisma.retailShift.findFirst({
      where: {
        id: input.shiftId,
        companyId: session.user.companyId,
        status: "OPEN",
        cashierId: session.user.id,
      },
    });
    if (!shift) {
      return errorResponse("Open shift not found for this cashier", 409);
    }
    if (shift.siteId !== site.id) {
      return errorResponse("Shift site does not match the selected site", 409);
    }

    const promotion = input.promotionId
      ? await prisma.retailPromotion.findFirst({
          where: {
            id: input.promotionId,
            companyId: session.user.companyId,
            status: "ACTIVE",
            type: { in: getPosSupportedPromotionTypes() },
          },
        })
      : null;

    if (input.promotionId && !promotion) {
      const existingPromotion = await prisma.retailPromotion.findFirst({
        where: { id: input.promotionId, companyId: session.user.companyId },
        select: { id: true, type: true, status: true },
      });
      if (
        existingPromotion &&
        existingPromotion.status === "ACTIVE" &&
        !isPosSupportedPromotionType(existingPromotion.type)
      ) {
        return errorResponse("This promotion type is not supported in POS checkout yet", 400);
      }
      return errorResponse("Promotion is not active", 400);
    }

    if (promotion && !inPromotionWindow(promotion)) {
      return errorResponse("Promotion is not active", 400);
    }

    // S-4b. The range is `Product` + the `InventoryItem` behind it at this
    // branch, resolved in one query. The site check that used to compare
    // `RetailCatalogItem.siteId` is now inherent: a product with no stock row at
    // the selected site simply does not come back.
    const { products: sellable, missing } = await loadSellableProducts({
      companyId: session.user.companyId,
      siteId: site.id,
      productIds: input.items.map((item) => item.productId),
    });

    if (missing.length > 0) {
      return errorResponse("One or more catalog items are invalid", 400);
    }

    // S-3. *The* resolution point. The shelf price comes out of the core price
    // engine, resolved once for the whole basket — per line, because a volume
    // break depends on how many the customer is buying.
    const shelfPrices = await resolveShelfPrices(
      session.user.companyId,
      input.items.map((item, index) => {
        const product = sellable.get(item.productId);
        return {
          id: `${item.productId}:${index}`,
          productId: item.productId,
          unitPrice: product?.standardPrice ?? 0,
          taxPercent: product?.defaultTaxRate ?? 0,
          quantity: item.quantity,
        };
      }),
    );

    const preNormalizedLines = input.items.map((item, index) => {
      const listing = sellable.get(item.productId)!;
      const inventoryItem = listing.inventoryItem;

      const lineKey = `${listing.productId}:${index}`;
      const shelf = shelfPrices.get(lineKey);
      if (!shelf) {
        throw new Error(`Unable to price ${listing.name}.`);
      }

      // `calculateRetailCheckout` is shared with the offline till, which stores
      // plain JSON, so the calculator stays in `number` and the crossing from
      // `Decimal` happens here — in `shelf-pricing.ts` now rather than off the
      // column. Moving the calculator to `Decimal` means shipping decimal.js to
      // the till bundle and reworking the offline store — its own ticket, noted
      // in the R-1.1 entry of the hardening plan.
      const unitPrice = item.unitPrice ?? shelf.unitPrice;
      const lineDiscount = item.discountAmount ?? 0;
      if (lineDiscount > round(unitPrice * item.quantity)) {
        throw new Error(`Line discount exceeds line amount for ${listing.name}.`);
      }

      return {
        lineKey,
        listing,
        inventoryItem,
        shelf,
        quantity: item.quantity,
        unitPrice,
        baseDiscountAmount: lineDiscount,
      };
    });
    const requestedInventoryQuantities = preNormalizedLines.reduce<Map<string, number>>(
      (accumulator, line) => {
        accumulator.set(
          line.inventoryItem.id,
          round((accumulator.get(line.inventoryItem.id) ?? 0) + line.quantity),
        );
        return accumulator;
      },
      new Map(),
    );
    for (const line of preNormalizedLines) {
      const requestedQty = requestedInventoryQuantities.get(line.inventoryItem.id) ?? 0;
      /*
        This one was correct by accident: `currentStock` is a `Decimal` and
        `requestedQty` a `number`, and a mixed comparison coerces back to
        numbers. It is written explicitly anyway — the accident is one
        refactor away from being a till that refuses to sell 2 bottles out of
        14 because "14" < "2" is true.
      */
      if (!atLeast(line.inventoryItem.currentStock, requestedQty)) {
        throw new Error(`Insufficient stock for ${line.listing.name}.`);
      }
    }
    const orderDiscountAmount = round(input.discountAmount ?? 0);
    const requestedRedeemPoints = Math.max(input.loyaltyRedemptionPoints ?? 0, 0);
    const loyaltyDiscountAmount = round(requestedRedeemPoints / LOYALTY_REDEEM_POINTS_PER_USD);
    if (loyaltyDiscountAmount > orderDiscountAmount + 0.01) {
      return errorResponse("Loyalty redemption exceeds order discount amount", 400);
    }

    const hasManualDiscount = Math.max(orderDiscountAmount - loyaltyDiscountAmount, 0) > 0.009;

    /**
     * S-7.3. A sale that has already happened is judged by a different rule.
     *
     * The manager-password gate below is the right rule for a price being changed
     * *now*, at the counter, with a manager on the floor. It is the wrong rule for
     * a sale rung offline last night: there is nobody to approve it after the
     * fact, so applying the gate to a replay refuses money the shop has already
     * taken, loses the sale from the books and leaves the stock figure wrong.
     *
     * `reviewReplayedPrices` is the rule that was written for this in S-3 and
     * until now had no caller — the client replays through this route, not through
     * `pos/sync`, so the review never ran and a shelf price changed after an
     * offline sale meant that sale could never be posted. It asks the narrower
     * question: is there an innocent explanation. A price rewritten after the sale
     * (SUPERSEDED) and a price changed by somebody entitled to change it with a
     * reason (OVERRIDDEN) are both explained; anything else is refused, and only
     * that last case is refused.
     */
    const replaySoldAt = input.offlineCreatedAt ? new Date(input.offlineCreatedAt) : null;
    const replayReview = replaySoldAt
      ? reviewReplayedPrices({
          lines: preNormalizedLines.map((line) => ({
            itemName: line.listing.name,
            submittedUnitPrice: line.unitPrice,
            resolvedUnitPrice: line.shelf.unitPrice,
            priceChangedAt: line.shelf.priceChangedAt
              ? new Date(line.shelf.priceChangedAt)
              : null,
          })),
          soldAt: replaySoldAt,
          snapshotPricedAt: input.pricedAt ? new Date(input.pricedAt) : null,
          actorCanOverride: canRetailRoleDo(session.user.role, "retail.sell", "approve"),
          overrideReason: input.overrideReason?.trim() || null,
        })
      : null;

    if (replayReview?.error) {
      // 409 rather than 403: the caller is not forbidden, the sale is in conflict
      // with the shelf. The offline queue reads the difference — a 403 is a
      // permission the till could never acquire, a 409 is a thing a manager can
      // re-post.
      return errorResponse(replayReview.error, 409);
    }

    const hasOverride =
      hasManualDiscount ||
      preNormalizedLines.some(
        (line) =>
          line.baseDiscountAmount > 0 ||
          // Compared against what the price engine resolved, not against the
          // listing column. Otherwise a shop that edits its shelf price on the
          // list would have every subsequent sale look like an override.
          //
          // A replay whose review came back clean has already had every price
          // difference explained, so it does not go round the gate again.
          (replayReview === null &&
            Math.abs(line.unitPrice - line.shelf.unitPrice) > 0.009),
      );

    let overrideReason = input.overrideReason?.trim() || input.managerOverride?.reason?.trim() || null;

    if (hasOverride && !canRetailRoleDo(session.user.role, "retail.sell", "approve")) {
      if (!input.managerOverride) {
        return errorResponse("Manager approval is required for price or discount overrides", 403);
      }

      const manager = await prisma.user.findFirst({
        where: {
          companyId: session.user.companyId,
          isActive: true,
          ...(input.managerOverride.managerUserId
            ? { id: input.managerOverride.managerUserId }
            : {
                email: {
                  equals: input.managerOverride.managerEmail ?? "",
                  mode: "insensitive",
                },
              }),
        },
        select: { id: true, name: true, email: true, password: true, role: true },
      });
      if (!manager || !canRetailRoleDo(manager.role, "retail.sell", "approve")) {
        return errorResponse("Manager approval is invalid", 403);
      }
      if (!manager.password) {
        return errorResponse("Manager approval is invalid", 403);
      }

      const validPassword = await bcrypt.compare(input.managerOverride.managerPassword, manager.password);
      if (!validPassword) {
        return errorResponse("Manager approval is invalid", 403);
      }
      if (!overrideReason) {
        return errorResponse("Add an override reason before posting this sale", 400);
      }
      overrideReason = `${overrideReason} (approved by ${manager.name || manager.email})`;
    }

    if (hasOverride && !overrideReason) {
      return errorResponse("Add an override reason before posting this sale", 400);
    }

    // What the review found, written onto the sale. This is the record a manager
    // reads later — and the one the till's offline-queue screen reads back to say
    // what a superseded price actually did, rather than reporting "synced" and
    // leaving the shop to find out from a margin report.
    if (replayReview?.overrideNote) {
      overrideReason = [overrideReason, replayReview.overrideNote]
        .filter((value): value is string => Boolean(value))
        .join(" | ");
    }

    const checkout = calculateRetailCheckout({
      lines: preNormalizedLines.map((line) => ({
        id: line.lineKey,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxPercent: line.shelf.taxPercent,
        // The list says whether the shelf price already contains the VAT. On a
        // Zimbabwean shelf it does, so the ex-VAT line and the tax are carved
        // out of $1.20 rather than added to it.
        taxInclusive: line.shelf.taxInclusive,
        lineDiscountAmount: line.baseDiscountAmount,
      })),
      orderDiscountAmount: input.discountAmount ?? 0,
      promotion: promotion
        ? {
            id: promotion.id,
            type: promotion.type,
            value: toNumberOrZero(promotion.value),
          }
        : null,
    });
    const normalizedLineMap = new Map(checkout.lines.map((line) => [line.id, line]));
    const normalizedLines = preNormalizedLines.map((line) => {
      const calculated = normalizedLineMap.get(line.lineKey);
      if (!calculated) {
        throw new Error(`Unable to price ${line.listing.name}.`);
      }
      return {
        ...line,
        discountAmount: calculated.discountAmount,
        taxAmount: calculated.taxAmount,
        lineTotal: calculated.lineTotal,
      };
    });

    const subtotal = checkout.subtotal;
    const totalDiscount = checkout.discountAmount;
    const taxAmount = checkout.taxAmount;
    const totalAmount = checkout.total;
    const normalizedPayments = input.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: round(payment.amount),
      reference: payment.reference?.trim() || null,
    }));
    const tenderPolicy = await getRetailTenderPolicy(session.user.companyId);
    const paymentReferenceError = validateTenderReferences(tenderPolicy, normalizedPayments);
    if (paymentReferenceError) {
      return errorResponse(paymentReferenceError, 400);
    }
    const tenderedAmount = round(
      normalizedPayments.reduce((total, payment) => total + payment.amount, 0),
    );
    const nonCashTotal = round(
      normalizedPayments
        .filter((payment) => payment.tenderType !== "CASH")
        .reduce((total, payment) => total + payment.amount, 0),
    );
    if (nonCashTotal > totalAmount) {
      return errorResponse("Non-cash tenders cannot exceed the sale total", 400);
    }

    if (tenderedAmount < totalAmount) {
      return errorResponse("Tendered amount is below the sale total", 400);
    }
    const customerPhone = normalizePhone(input.customerPhone);
    const customerEmail = normalizeEmail(input.customerEmail);
    const requestedCustomerName = input.customerName?.trim() || null;
    let capturedCustomer:
      | {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
        }
      | null = null;
    let resolvedCustomerName = requestedCustomerName;

    if (input.customerId) {
      const selectedCustomer = await prisma.customer.findFirst({
        where: {
          id: input.customerId,
          companyId: session.user.companyId,
          isActive: true,
        },
        select: { id: true, name: true, phone: true, email: true },
      });
      if (!selectedCustomer) {
        return errorResponse("Selected customer is invalid", 400);
      }
      capturedCustomer =
        customerPhone || customerEmail
          ? await prisma.customer.update({
              where: { id: selectedCustomer.id },
              data: {
                ...(customerPhone && selectedCustomer.phone !== customerPhone
                  ? { phone: customerPhone }
                  : {}),
                ...(customerEmail && selectedCustomer.email !== customerEmail
                  ? { email: customerEmail }
                  : {}),
              },
              select: { id: true, name: true, phone: true, email: true },
            })
          : selectedCustomer;
      resolvedCustomerName = selectedCustomer.name;
    } else if (requestedCustomerName || customerPhone || customerEmail) {
      const fallbackName = customerPhone ? `Customer ${customerPhone}` : customerEmail ?? null;
      const customerName = requestedCustomerName || fallbackName;
      if (customerName) {
        const existingCustomer = await prisma.customer.findFirst({
          where: {
            companyId: session.user.companyId,
            OR: [
              ...(customerPhone ? [{ phone: customerPhone }] : []),
              ...(customerEmail ? [{ email: customerEmail }] : []),
              ...(requestedCustomerName
                ? [{ name: { equals: requestedCustomerName, mode: "insensitive" as const } }]
                : []),
            ],
          },
          select: { id: true, name: true, phone: true, email: true },
        });

        capturedCustomer = existingCustomer
          ? await prisma.customer.update({
              where: { id: existingCustomer.id },
              data: {
                ...(requestedCustomerName && existingCustomer.name !== requestedCustomerName
                  ? { name: requestedCustomerName }
                  : {}),
                ...(customerPhone && existingCustomer.phone !== customerPhone
                  ? { phone: customerPhone }
                  : {}),
                ...(customerEmail && existingCustomer.email !== customerEmail
                  ? { email: customerEmail }
                  : {}),
              },
              select: { id: true, name: true, phone: true, email: true },
            })
          : await prisma.customer.create({
              data: {
                companyId: session.user.companyId,
                name: customerName,
                phone: customerPhone,
                email: customerEmail,
                contactName: requestedCustomerName || undefined,
              },
              select: { id: true, name: true, phone: true, email: true },
            });
        resolvedCustomerName = capturedCustomer.name;
      }
    }

    if (requestedRedeemPoints > 0) {
      if (!resolvedCustomerName) {
        return errorResponse("Select a customer before loyalty redemption", 400);
      }
      const loyalty = await getCustomerLoyaltyBalance({
        companyId: session.user.companyId,
        customerName: resolvedCustomerName,
      });
      if (requestedRedeemPoints > loyalty.balance) {
        return errorResponse("Loyalty points redemption exceeds customer balance", 400);
      }
      const maxRedeemAmount = round(totalAmount * LOYALTY_MAX_REDEEM_SHARE);
      if (loyaltyDiscountAmount > maxRedeemAmount + 0.01) {
        return errorResponse(
          `Loyalty redemption cannot exceed ${(LOYALTY_MAX_REDEEM_SHARE * 100).toFixed(0)}% of sale total`,
          400,
        );
      }
      if (Math.abs(orderDiscountAmount - loyaltyDiscountAmount) > 0.01) {
        return errorResponse("Order discount must match loyalty redemption amount", 400);
      }
    }

    const loyaltyNote =
      requestedRedeemPoints > 0 ? `LOYALTY_REDEEM:${requestedRedeemPoints}` : null;
    // S-7.3. Marks the sale as one the till took while the line was down, so the
    // queue screen and the audit log can tell a replay from a sale rung at the
    // counter without guessing from timestamps.
    const replayNote = replaySoldAt
      ? `${OFFLINE_REPLAY_NOTE_MARKER}:${replaySoldAt.toISOString()}`
      : null;
    const normalizedNotes = [input.notes?.trim() || null, replayNote, loyaltyNote]
      .filter((value): value is string => Boolean(value))
      .join(" | ");

    const { sale, accounting } = await createRetailSaleTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      saleNo: input.saleNo ?? null,
      clientRef: input.clientRef ?? null,
      shiftId: shift.id,
      siteId: site.id,
      customerName: resolvedCustomerName,
      subtotal,
      discountAmount: totalDiscount,
      taxAmount,
      totalAmount,
      payments: normalizedPayments,
      lines: normalizedLines.map((line) => ({
        inventoryItemId: line.inventoryItem.id,
        inventoryUnit: line.inventoryItem.unit,
        productId: line.listing.productId,
        itemName: line.listing.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
        taxAmount: line.taxAmount,
        lineTotal: line.lineTotal,
        costUnit: line.inventoryItem.unitCost ?? 0,
        costTotal: round(line.quantity * (line.inventoryItem.unitCost ?? 0)),
      })),
      promotionCode: promotion?.promoCode ?? null,
      overrideReason: overrideReason ?? null,
      notes: normalizedNotes || null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });

    const customerNetSpend =
      resolvedCustomerName && resolvedCustomerName !== "Walk-in"
        ? await getCustomerLoyaltyBalance({
            companyId: session.user.companyId,
            customerName: resolvedCustomerName,
          })
        : null;
    const loyaltyPointsEarned =
      resolvedCustomerName && money(sale.totalAmount).greaterThan(0)
        ? Math.floor(toNumberOrZero(sale.totalAmount))
        : 0;
    const loyaltyPointsRedeemed = parseLoyaltyRedeemPoints(sale.notes);
    const loyaltyPointsBalance = Math.max(customerNetSpend?.balance ?? 0, 0);

    return successResponse({
      id: sale.id,
      saleNo: sale.saleNo,
      saleType: sale.saleType,
      status: sale.status,
      postedAt: sale.postedAt ?? sale.createdAt,
      shiftId: sale.shiftId,
      siteId: sale.siteId,
      cashierId: sale.cashierId,
      cashierName: sale.cashierName,
      customerName: sale.customerName,
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      taxAmount: sale.taxAmount,
      totalAmount: sale.totalAmount,
      tenderedAmount: sale.tenderedAmount,
      changeAmount: sale.changeAmount,
      payments: sale.payments,
      lines: sale.lines,
      promotionCode: sale.promotionCode,
      overrideReason: sale.overrideReason,
      notes: sale.notes,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
      customerPhone: capturedCustomer?.phone ?? customerPhone,
      customerEmail: capturedCustomer?.email ?? customerEmail,
      loyalty:
        resolvedCustomerName && resolvedCustomerName !== "Walk-in"
          ? {
              pointsEarned: loyaltyPointsEarned,
              pointsRedeemed: loyaltyPointsRedeemed,
              pointsBalance: loyaltyPointsBalance,
              tier: getLoyaltyTier(loyaltyPointsBalance),
            }
          : null,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to post sale", 400);
  }
}
