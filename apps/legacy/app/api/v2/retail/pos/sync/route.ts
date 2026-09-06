/**
 * POS Sync API Endpoint
 * ---------------------------------------------------------------------------
 * Accepts batched offline operations from the POS client, validates them,
 * and processes them in dependency order.
 *
 * POST /api/v2/retail/pos/sync
 * Body: { operations: Array<SyncOperationRequest> }
 *
 * Sync order (dependencies):
 *   1. open-shift → 2. create-customer → 3. create-sale → 4. create-held-cart
 *
 * Conflict resolution: server-wins for all conflicts.
 * Returns: { results: Array<SyncOperationResult> }
 *
 * FD-5: once every operation has been applied, the sales this batch produced
 * are fiscalised in one ordered pass (see {@link drainFiscalisation}). That
 * pass is the only place the till reaches ZIMRA, and it is deliberately the
 * last thing the request does — a fiscal failure must never cost the shop a
 * sale that has already been rung.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma, RetailTenderType } from "@corelithzw/db";
import { errorResponse, successResponse } from "@corelithzw/platform/api-response";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { prisma } from "@corelithzw/db/client";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import { canRetailRoleDo, requireRetailPermission } from "@/lib/retail/permissions";
import { reviewReplayedPrices } from "@/lib/retail/replay-price-review";
import { loadSellableProducts } from "@/lib/retail/shelf-listing";
import { resolveShelfPrices } from "@/lib/retail/shelf-pricing";
import {
  getPosSupportedPromotionTypes,
  requireRetailSession,
} from "../../_helpers";
import {
  closeRetailShiftTransaction,
  createRetailSaleTransaction,
  openRetailShiftTransaction,
  refundRetailSaleTransaction,
  voidRetailSaleTransaction,
} from "../../_services";
import { fiscaliseRetailSales } from "@/lib/retail/fiscalisation";

// ── Request Schemas ─────────────────────────────────────────────────────────

const syncOperationSchema = z.object({
  clientOperationId: z.string().min(1),
  operation: z.enum([
    "open-shift",
    "close-shift",
    "create-customer",
    "create-sale",
    "void-sale",
    "refund-sale",
    "create-held-cart",
    "delete-held-cart",
  ]),
  dependsOn: z.array(z.string()).optional().default([]),
  payload: z.record(z.string(), z.unknown()),
  localRefs: z.record(z.string(), z.string()).optional(),
  offlineCreatedAt: z.string().datetime().optional(),
});

const syncRequestSchema = z.object({
  operations: z.array(syncOperationSchema).min(1).max(50),
  deviceId: z.string().optional(),
});

// ── Response Types ──────────────────────────────────────────────────────────

interface SyncOperationResult {
  clientOperationId: string;
  status: "synced" | "failed" | "conflict" | "skipped";
  serverId?: string | null;
  saleNo?: string | null;
  error?: string | null;
  accountingStatus?: "POSTED" | "PENDING" | "FAILED" | null;
  accountingError?: string | null;
  /**
   * FD-5 — what ZIMRA was told about this sale, filled in by the fiscal drain
   * after every write in the batch has landed. `SKIPPED` is the ordinary answer
   * for a shop with no fiscal device; `PENDING` means the receipt is signed,
   * numbered and durable but FDMS has not answered yet, which is still a
   * scannable slip because the QR is derived from the signature.
   */
  fiscalStatus?: "SKIPPED" | "SUCCESS" | "PENDING" | "FAILED" | null;
  fiscalReceiptId?: string | null;
  fiscalNumber?: string | null;
  fiscalQrCodeData?: string | null;
  fiscalError?: string | null;
  conflicts?: Array<{ field: string; serverValue: unknown; clientValue: unknown }>;
}

// ── Context for Dependency Resolution ───────────────────────────────────────

interface SyncContext {
  session: Awaited<ReturnType<typeof requireRetailSession>>["session"] & {
    user: { id: string; companyId: string; name?: string | null; email?: string | null; role: string };
  };
  companyId: string;
  userId: string;
  deviceId?: string;
  // Map of tempId → serverId for resolved entities
  resolvedIds: Map<string, string>;
  // Map of clientOperationId → result
  results: Map<string, SyncOperationResult>;
}

/**
 * FD-5 — the sales this batch wrote, in the order the till rang them.
 *
 * Collected during the loop and drained after it, never inline, for two
 * reasons. A sale that this same batch voids must never reach ZIMRA: the void
 * arrives as a later operation, and fiscalising the sale the moment it is
 * created would have sent a receipt for something the queue already knows was
 * cancelled. And a refund needs its original's fiscal receipt, which exists
 * only once the original has been through the drain — so one ordered pass over
 * the whole batch settles both without the operations having to know about each
 * other.
 */
type FiscalDrainEntry = { clientOperationId: string; saleId: string };

/** Operations that produce a `RetailSale` row worth fiscalising. A void
 *  produces one too: the reversal is a credit note whenever the sale it
 *  reverses already reached ZIMRA. */
const FISCALISABLE_OPERATIONS = new Set(["create-sale", "refund-sale", "void-sale"]);

function round(value: number) {
  return Number(value.toFixed(2));
}

async function resolveReplayShiftId(
  ctx: SyncContext,
  shiftId: string | null | undefined,
) {
  if (shiftId) {
    return ctx.resolvedIds.get(shiftId) ?? shiftId;
  }

  const currentShift = await prisma.retailShift.findFirst({
    where: {
      companyId: ctx.companyId,
      cashierId: ctx.userId,
      status: "OPEN",
    },
    orderBy: [{ openedAt: "desc" }],
    select: { id: true },
  });

  return currentShift?.id ?? null;
}

function resolveReferencedId(ctx: SyncContext, value: string | null | undefined) {
  if (!value) return null;
  return ctx.resolvedIds.get(value) ?? value;
}

// ── Operation Processors ────────────────────────────────────────────────────

async function processOpenShift(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as {
    siteId: string;
    openingCash: number;
    registerName?: string;
    openedAt: string;
    employeeId: string;
    tempShiftId: string;
  };

  try {
    const existingShift = await prisma.retailShift.findFirst({
      where: {
        companyId: ctx.companyId,
        cashierId: ctx.userId,
        status: "OPEN",
      },
    });

    if (existingShift) {
      ctx.resolvedIds.set(payload.tempShiftId, existingShift.id);
      ctx.resolvedIds.set(op.clientOperationId, existingShift.id);
      return {
        clientOperationId: op.clientOperationId,
        status: "conflict",
        serverId: existingShift.id,
        error: "An open shift already exists for this cashier",
      };
    }

    const { shift, accounting } = await openRetailShiftTransaction({
      actor: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        userRole: ctx.session.user.role,
        userName: ctx.session.user.name,
        userEmail: ctx.session.user.email,
      },
      siteId: payload.siteId,
      registerName: payload.registerName ?? "POS Register",
      registerCode: payload.registerName?.toUpperCase().replace(/\s/g, "_") ?? "POS",
      openingFloat: payload.openingCash,
      openedAt: new Date(payload.openedAt),
    });

    ctx.resolvedIds.set(payload.tempShiftId, shift.id);
    ctx.resolvedIds.set(op.clientOperationId, shift.id);

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: shift.id,
      saleNo: shift.shiftNo,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to open shift";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

async function processCloseShift(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as {
    shiftId: string;
    closingCash: number;
    closingNotes?: string;
    closedAt: string;
  };

  try {
    const resolvedShiftId = await resolveReplayShiftId(ctx, payload.shiftId);
    if (!resolvedShiftId) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Open shift not found" };
    }

    const { shift, accounting } = await closeRetailShiftTransaction({
      actor: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        userRole: ctx.session.user.role,
        userName: ctx.session.user.name,
        userEmail: ctx.session.user.email,
      },
      shiftId: resolvedShiftId,
      countedCash: payload.closingCash,
      notes: payload.closingNotes ?? null,
      closedAt: new Date(payload.closedAt),
      allowManagerClose: false,
    });

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: shift.id,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to close shift";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

async function processCreateCustomer(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as {
    name: string;
    phone?: string | null;
    email?: string | null;
    nationalId?: string | null;
    address?: string | null;
    loyaltyTier?: string;
    tempId: string;
  };

  try {
    // Check for duplicate by phone or email
    const existingWhere: Prisma.CustomerWhereInput = { companyId: ctx.companyId };
    if (payload.phone) {
      existingWhere.phone = payload.phone;
    } else if (payload.email) {
      existingWhere.email = payload.email;
    } else {
      existingWhere.name = { equals: payload.name, mode: "insensitive" };
    }

    const existing = await prisma.customer.findFirst({
      where: existingWhere,
    });

    if (existing) {
      // Server wins — return existing customer
      ctx.resolvedIds.set(payload.tempId, existing.id);
      ctx.resolvedIds.set(op.clientOperationId, existing.id);
      return {
        clientOperationId: op.clientOperationId,
        status: "conflict",
        serverId: existing.id,
        error: "Customer already exists",
      };
    }

    const customer = await prisma.customer.create({
      data: {
        companyId: ctx.companyId,
        name: payload.name,
        phone: payload.phone ?? null,
        email: payload.email?.toLowerCase() ?? null,
        address: payload.address ?? null,
        contactName: payload.name,
      },
    });

    ctx.resolvedIds.set(payload.tempId, customer.id);
    ctx.resolvedIds.set(op.clientOperationId, customer.id);

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: customer.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create customer";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

async function processCreateSale(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as {
    /**
     * S-7.7 — optional now. A device that queued a sale before the split still
     * has one and it is honoured; anything queued since sends `clientRef` and
     * lets the server number the receipt.
     */
    saleNo?: string;
    /** The till's key for the attempt. This is what makes a replay safe. */
    clientRef?: string;
    shiftId: string;
    siteId: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    items: Array<{
      /** S-4b — a `Product.id`, where the device used to send a listing id. */
      productId: string;
      name?: string;
      quantity: number;
      /** What the device charged. Absent means "whatever the shelf said". */
      unitPrice?: number;
      discountAmount?: number;
    }>;
    /** The order-level discount the cashier keyed. */
    discountAmount?: number;
    payments: Array<{
      tenderType: string;
      amount: number;
      reference?: string;
    }>;
    overrideReason?: string;
    promotionId?: string;
    /**
     * S-3 (b). When the device resolved the prices it rang this sale at. The
     * catalogue snapshot carries it; a device that predates the field simply
     * does not send it, and the sale's own time is used instead.
     */
    pricedAt?: string;
    priceListId?: string;
    offlineCreatedAt?: string;
    offlineCreated?: boolean;
    deviceId?: string;
  };

  try {
    const resolvedShiftId = resolveReferencedId(ctx, payload.shiftId);
    if (!resolvedShiftId) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Open shift not found" };
    }
    const resolvedCustomerId = payload.customerId
      ? (ctx.resolvedIds.get(payload.customerId) ?? payload.customerId)
      : undefined;

    // S-4b. `Product` + the `InventoryItem` behind it at the branch this sale was
    // rung at, in one query. The replay is site-scoped for the same reason the
    // online path is: the stock that moved was the stock at that till.
    const { products: sellable, missing } = await loadSellableProducts({
      companyId: ctx.companyId,
      siteId: payload.siteId,
      productIds: payload.items.map((i) => i.productId),
    });

    if (missing.length > 0) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "One or more catalog items invalid" };
    }

    const soldAt = new Date(payload.offlineCreatedAt ?? op.offlineCreatedAt ?? Date.now());

    // S-3 (c), closing 0.3(4). This handler used to persist the device's
    // `unitPrice` verbatim — no catalogue re-check, no override gate — while the
    // online path enforced both. Everything below is the online path's rule,
    // applied to a sale that has already happened.
    const shelfPrices = await resolveShelfPrices(
      ctx.companyId,
      payload.items.map((item, index) => {
        const listing = sellable.get(item.productId);
        return {
          id: `${item.productId}:${index}`,
          productId: item.productId,
          unitPrice: listing?.standardPrice ?? 0,
          taxPercent: listing?.defaultTaxRate ?? 0,
          quantity: item.quantity,
        };
      }),
    );

    const replayLines = payload.items.map((item, index) => {
      const lineKey = `${item.productId}:${index}`;
      const listing = sellable.get(item.productId);
      const shelf = shelfPrices.get(lineKey);
      if (!listing || !shelf) {
        throw new Error(`Inventory mapping missing for ${item.name ?? item.productId}`);
      }
      return { lineKey, item, listing, inventoryItem: listing.inventoryItem, shelf };
    });

    const review = reviewReplayedPrices({
      lines: replayLines.map((line) => ({
        itemName: line.listing.name,
        submittedUnitPrice: line.item.unitPrice,
        resolvedUnitPrice: line.shelf.unitPrice,
        priceChangedAt: line.shelf.priceChangedAt ? new Date(line.shelf.priceChangedAt) : null,
      })),
      soldAt,
      snapshotPricedAt: payload.pricedAt ? new Date(payload.pricedAt) : null,
      actorCanOverride: canRetailRoleDo(ctx.session.user.role, "retail.sell", "approve"),
      overrideReason: payload.overrideReason?.trim() || null,
    });

    if (review.error) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: review.error };
    }

    // The promotion is re-read rather than taken on the device's word, the same
    // way the online path re-reads it. Without this the replay would drop the
    // discount the customer was actually given and demand more tender than the
    // shop took.
    const promotion = payload.promotionId
      ? await prisma.retailPromotion.findFirst({
          where: {
            id: payload.promotionId,
            companyId: ctx.companyId,
            type: { in: getPosSupportedPromotionTypes() },
          },
          select: { id: true, type: true, value: true, promoCode: true },
        })
      : null;

    // The money is recomputed here, never carried across from the device. The
    // device sends what was sold and at what unit price; what that comes to is
    // the server's arithmetic, so a till running an older build of the
    // calculator cannot write a total the books disagree with.
    const checkout = calculateRetailCheckout({
      lines: replayLines.map((line, index) => ({
        id: line.lineKey,
        quantity: line.item.quantity,
        unitPrice: review.lines[index].unitPrice,
        taxPercent: line.shelf.taxPercent,
        taxInclusive: line.shelf.taxInclusive,
        lineDiscountAmount: line.item.discountAmount ?? 0,
      })),
      orderDiscountAmount: payload.discountAmount ?? 0,
      promotion: promotion
        ? { id: promotion.id, type: promotion.type, value: Number(promotion.value) }
        : null,
    });
    const calculatedByKey = new Map(checkout.lines.map((line) => [line.id, line]));

    const saleLines = replayLines.map((line, index) => {
      const calculated = calculatedByKey.get(line.lineKey);
      if (!calculated) {
        throw new Error(`Unable to price ${line.listing.name}`);
      }
      return {
        inventoryItemId: line.inventoryItem.id,
        inventoryUnit: line.inventoryItem.unit,
        productId: line.item.productId,
        itemName: line.item.name ?? line.listing.name,
        quantity: line.item.quantity,
        unitPrice: review.lines[index].unitPrice,
        discountAmount: calculated.discountAmount,
        taxAmount: calculated.taxAmount,
        lineTotal: calculated.lineTotal,
        costUnit: line.inventoryItem.unitCost ?? 0,
        costTotal: round(line.item.quantity * (line.inventoryItem.unitCost ?? 0)),
      };
    });

    const overrideReason = [payload.overrideReason?.trim() || null, review.overrideNote]
      .filter((value): value is string => Boolean(value))
      .join(" | ");

    // Every `payload` in this file is an unchecked `as` cast of whatever the device
    // sent, so the tender type is validated here rather than trusted. It used to
    // reach a `String` column and land whatever it liked; against the enum it would
    // be a Postgres error surfacing as a 500, when what the device deserves is a
    // failed operation it can report and retry against.
    const payments = payload.payments.map((payment) => {
      const tenderType = RetailTenderType[payment.tenderType as keyof typeof RetailTenderType];
      if (!tenderType) {
        throw new Error(
          `Unknown tender type "${payment.tenderType}" — expected one of ` +
            `${Object.values(RetailTenderType).join(", ")}`,
        );
      }
      return { ...payment, tenderType };
    });

    let customerName: string | null = null;
    if (resolvedCustomerId) {
      const customer = await prisma.customer.findFirst({
        where: { id: resolvedCustomerId, companyId: ctx.companyId },
        select: { name: true },
      });
      customerName = customer?.name ?? payload.customerName ?? null;
    } else {
      customerName = payload.customerName ?? null;
    }

    const { sale, accounting } = await createRetailSaleTransaction({
      actor: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        userRole: ctx.session.user.role,
        userName: ctx.session.user.name,
        userEmail: ctx.session.user.email,
      },
      saleNo: payload.saleNo,
      /*
        The replay's whole safety rests on this. `createRetailSaleTransaction`
        looks for a sale already carrying it and returns that one, so a queue
        that fires twice — or a response lost on the first attempt — cannot post
        the same basket to the ledger a second time.
      */
      clientRef: payload.clientRef ?? payload.saleNo ?? null,
      shiftId: resolvedShiftId,
      siteId: payload.siteId,
      customerName,
      subtotal: checkout.subtotal,
      discountAmount: checkout.discountAmount,
      taxAmount: checkout.taxAmount,
      totalAmount: checkout.total,
      payments,
      lines: saleLines,
      promotionCode: promotion?.promoCode ?? null,
      overrideReason: overrideReason || null,
      notes: payload.offlineCreated
        ? `Offline replay from device ${ctx.deviceId ?? payload.deviceId ?? "unknown"}`
        : null,
      postedAt: soldAt,
    });

    ctx.resolvedIds.set(op.clientOperationId, sale.id);
    /*
      Whatever the device called this sale, later operations in the same batch —
      a refund against it, say — reference it by that name. Post-S-7.7 that is
      `clientRef`; an entry queued before the split still says `saleNo`.
    */
    const clientKey = payload.clientRef ?? payload.saleNo;
    if (clientKey) ctx.resolvedIds.set(clientKey, sale.id);

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: sale.id,
      saleNo: sale.saleNo,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create sale";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

async function processVoidSale(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as {
    saleId: string;
    reason: string;
    voidedAt: string;
    shiftId?: string;
    notes?: string;
    periodOverrideReason?: string;
  };

  try {
    const resolvedSaleId = resolveReferencedId(ctx, payload.saleId);
    if (!resolvedSaleId) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Sale not found" };
    }

    const resolvedShiftId = await resolveReplayShiftId(ctx, payload.shiftId);
    if (!resolvedShiftId) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Open shift not found" };
    }

    const { sale, accounting } = await voidRetailSaleTransaction({
      actor: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        userRole: ctx.session.user.role,
        userName: ctx.session.user.name,
        userEmail: ctx.session.user.email,
      },
      saleId: resolvedSaleId,
      shiftId: resolvedShiftId,
      reason: payload.reason,
      notes: payload.notes ?? null,
      periodOverrideReason: payload.periodOverrideReason ?? null,
      postedAt: new Date(payload.voidedAt),
    });

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: sale.id,
      saleNo: sale.saleNo,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to void sale";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

async function processRefundSale(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as {
    saleId: string;
    shiftId?: string;
    items: Array<{
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      refundAmount: number;
    }>;
    reason: string;
    refundTotal: number;
    originalSaleNo?: string;
    payments?: Array<{
      tenderType: "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";
      amount: number;
      reference?: string;
    }>;
    notes?: string;
    refundedAt?: string;
    periodOverrideReason?: string;
  };

  try {
    const resolvedSaleId = resolveReferencedId(ctx, payload.saleId);
    if (!resolvedSaleId) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Original sale not found" };
    }

    const sourceSale = await prisma.retailSale.findFirst({
      where: {
        id: resolvedSaleId,
        companyId: ctx.companyId,
        status: "POSTED",
      },
      include: { lines: true },
    });
    if (!sourceSale) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Original sale not found" };
    }

    const resolvedShiftId = await resolveReplayShiftId(ctx, payload.shiftId);
    if (!resolvedShiftId) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Open shift not found" };
    }

    const requestedLines = payload.items.map((item) => {
      const sourceLine = sourceSale.lines.find(
        (line) =>
          line.productId === item.productId ||
          line.itemName.toLowerCase() === item.name.toLowerCase(),
      );
      if (!sourceLine) {
        throw new Error(`Refund line not found for ${item.name}`);
      }
      return {
        saleLineId: sourceLine.id,
        quantity: item.quantity,
      };
    });

    const { sale, accounting } = await refundRetailSaleTransaction({
      actor: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        userRole: ctx.session.user.role,
        userName: ctx.session.user.name,
        userEmail: ctx.session.user.email,
      },
      saleId: resolvedSaleId,
      shiftId: resolvedShiftId,
      reason: payload.reason,
      lines: requestedLines,
      payments:
        payload.payments && payload.payments.length > 0
          ? payload.payments
          : [
              {
                tenderType: "CASH",
                amount: Math.abs(payload.refundTotal),
                reference: `Refund for ${payload.originalSaleNo ?? sourceSale.saleNo}`,
              },
            ],
      notes: payload.notes ?? payload.reason,
      periodOverrideReason: payload.periodOverrideReason ?? null,
      postedAt: payload.refundedAt ? new Date(payload.refundedAt) : undefined,
    });

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: sale.id,
      saleNo: sale.saleNo,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process refund";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

async function processCreateHeldCart(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as {
    shiftId: string;
    items: Array<{
      id: string;
      name: string;
      productId: string;
      quantity: number;
      unitPrice: number;
      taxPercent: number;
      lineDiscountAmount?: number;
    }>;
    note?: string;
    customerName?: string;
    customerPhone?: string;
    label?: string;
    heldAt: string;
    tempCartId: string;
  };

  try {
    const resolvedShiftId = ctx.resolvedIds.get(payload.shiftId) ?? payload.shiftId;

    const shift = await prisma.retailShift.findFirst({
      where: {
        id: resolvedShiftId,
        companyId: ctx.companyId,
        status: "OPEN",
      },
    });

    if (!shift) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Open shift not found" };
    }

    const holdNo = await reserveIdentifier(prisma, {
      companyId: ctx.companyId,
      entity: "RETAIL_HELD_CART",
      siteId: shift.siteId,
    });

    const cart = await prisma.retailHeldCart.create({
      data: {
        companyId: ctx.companyId,
        holdNo,
        shiftId: shift.id,
        cashierId: ctx.userId,
        label: payload.label ?? payload.customerName ?? null,
        cartSnapshot: {
          items: payload.items,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          note: payload.note,
        } as unknown as Prisma.InputJsonValue,
        status: "HELD",
      },
    });

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: cart.id,
      saleNo: cart.holdNo,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create held cart";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

async function processDeleteHeldCart(
  op: z.infer<typeof syncOperationSchema>,
  ctx: SyncContext
): Promise<SyncOperationResult> {
  const payload = op.payload as { cartId: string };

  try {
    await prisma.retailHeldCart.updateMany({
      where: {
        id: payload.cartId,
        companyId: ctx.companyId,
      },
      data: { status: "RELEASED" },
    });

    return { clientOperationId: op.clientOperationId, status: "synced" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete held cart";
    return { clientOperationId: op.clientOperationId, status: "failed", error: message };
  }
}

// ── Dependency Graph & Ordering ─────────────────────────────────────────────

function buildDependencyGraph(
  operations: z.infer<typeof syncOperationSchema>[]
): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();

  for (const op of operations) {
    graph.set(op.clientOperationId, new Set(op.dependsOn));
  }

  return graph;
}

function topologicalSort(
  operations: z.infer<typeof syncOperationSchema>[]
): z.infer<typeof syncOperationSchema>[] {
  const graph = buildDependencyGraph(operations);
  const inDegree = new Map<string, number>();

  // Initialize in-degrees
  for (const op of operations) {
    if (!inDegree.has(op.clientOperationId)) {
      inDegree.set(op.clientOperationId, 0);
    }
    inDegree.set(
      op.clientOperationId,
      (inDegree.get(op.clientOperationId) ?? 0) + op.dependsOn.length,
    );
  }

  // Kahn's algorithm
  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const result: z.infer<typeof syncOperationSchema>[] = [];
  const opMap = new Map(operations.map((op) => [op.clientOperationId, op]));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const op = opMap.get(id);
    if (op) result.push(op);

    // Find all operations that depend on this one
    for (const [opId, deps] of graph) {
      if (deps.has(id)) {
        const newDegree = (inDegree.get(opId) ?? 1) - 1;
        inDegree.set(opId, newDegree);
        if (newDegree === 0) {
          queue.push(opId);
        }
      }
    }
  }

  // If not all operations were processed, there was a cycle
  // Process remaining in original order
  const processedIds = new Set(result.map((r) => r.clientOperationId));
  for (const op of operations) {
    if (!processedIds.has(op.clientOperationId)) {
      result.push(op);
    }
  }

  return result;
}

// ── Fiscalisation Drain (FD-5) ──────────────────────────────────────────────

/**
 * Put this batch's sales onto the ZIMRA hash chain, in queue order.
 *
 * Runs after every write in the batch has committed, so it never fiscalises a
 * sale the same batch went on to void, and a refund always finds the original's
 * receipt. `fiscaliseRetailSales` is sequential by contract — the chain cannot
 * be signed in parallel — and it decides for itself whether a failure is about
 * one sale (skip it, keep draining) or about the device (stop, and say so on
 * the rest).
 *
 * Nothing here may fail the sync. The money is already taken, the stock is
 * already moved and the till is standing in front of a customer: an
 * unfiscalised sale is a durable row somebody can replay, whereas a 500 here
 * would make the client re-queue operations that have already been applied.
 */
async function drainFiscalisation(
  ctx: SyncContext,
  drain: FiscalDrainEntry[],
  results: SyncOperationResult[],
) {
  if (drain.length === 0) return;

  try {
    const outcomes = await fiscaliseRetailSales({
      companyId: ctx.companyId,
      saleIds: drain.map((entry) => entry.saleId),
    });

    const byClientOperationId = new Map(
      drain.map((entry, index) => [entry.clientOperationId, outcomes[index]]),
    );
    for (const result of results) {
      const fiscal = byClientOperationId.get(result.clientOperationId);
      if (!fiscal) continue;
      result.fiscalStatus = fiscal.fiscalStatus;
      result.fiscalReceiptId = fiscal.fiscalReceiptId;
      result.fiscalNumber = fiscal.fiscalNumber;
      result.fiscalQrCodeData = fiscal.qrCodeData;
      result.fiscalError = fiscal.fiscalError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fiscalisation failed";
    console.error("[POS Sync] Fiscalisation drain failed:", error);
    const queued = new Set(drain.map((entry) => entry.clientOperationId));
    for (const result of results) {
      if (!queued.has(result.clientOperationId)) continue;
      result.fiscalStatus = "FAILED";
      result.fiscalError = message;
    }
  }
}

// ── Main Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPermission(session, "retail.sell", "create");
  if (gate) return gate;

  try {
    const body = await request.json();
    const input = syncRequestSchema.parse(body);

    const ctx: SyncContext = {
      session: session as SyncContext["session"],
      companyId: session.user.companyId,
      userId: session.user.id,
      deviceId: input.deviceId,
      resolvedIds: new Map(),
      results: new Map(),
    };

    // Sort operations by dependency order
    const sortedOps = topologicalSort(input.operations);

    // Process each operation
    const results: SyncOperationResult[] = [];
    const fiscalDrain: FiscalDrainEntry[] = [];

    for (const op of sortedOps) {
      // Check if any dependency failed
      const failedDeps = op.dependsOn.filter((depId) => {
        const depResult = ctx.results.get(depId);
        return depResult && depResult.status === "failed";
      });

      if (failedDeps.length > 0) {
        const result: SyncOperationResult = {
          clientOperationId: op.clientOperationId,
          status: "skipped",
          error: `Dependency failed: ${failedDeps.join(", ")}`,
        };
        ctx.results.set(op.clientOperationId, result);
        results.push(result);
        continue;
      }

      let result: SyncOperationResult;

      switch (op.operation) {
        case "open-shift":
          result = await processOpenShift(op, ctx);
          break;
        case "close-shift":
          result = await processCloseShift(op, ctx);
          break;
        case "create-customer":
          result = await processCreateCustomer(op, ctx);
          break;
        case "create-sale":
          result = await processCreateSale(op, ctx);
          break;
        case "void-sale":
          result = await processVoidSale(op, ctx);
          break;
        case "refund-sale":
          result = await processRefundSale(op, ctx);
          break;
        case "create-held-cart":
          result = await processCreateHeldCart(op, ctx);
          break;
        case "delete-held-cart":
          result = await processDeleteHeldCart(op, ctx);
          break;
        default:
          result = {
            clientOperationId: op.clientOperationId,
            status: "failed",
            error: `Unknown operation: ${op.operation}`,
          };
      }

      ctx.results.set(op.clientOperationId, result);
      results.push(result);

      if (FISCALISABLE_OPERATIONS.has(op.operation) && result.status === "synced" && result.serverId) {
        fiscalDrain.push({ clientOperationId: op.clientOperationId, saleId: result.serverId });
      }
    }

    await drainFiscalisation(ctx, fiscalDrain, results);

    return successResponse({
      results,
      summary: {
        total: results.length,
        synced: results.filter((r) => r.status === "synced").length,
        conflicts: results.filter((r) => r.status === "conflict").length,
        failed: results.filter((r) => r.status === "failed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        fiscalised: results.filter((r) => r.fiscalStatus === "SUCCESS").length,
        fiscalPending: results.filter((r) => r.fiscalStatus === "PENDING").length,
        fiscalFailed: results.filter((r) => r.fiscalStatus === "FAILED").length,
      },
      resolvedIds: Object.fromEntries(ctx.resolvedIds),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[POS Sync] Error:", error);
    return errorResponse(
      error instanceof Error ? error.message : "Sync processing failed",
      500
    );
  }
}

// ── GET: Sync Status ────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. Whether the queue this till is holding has landed. Reading it is part
  // of selling; it says nothing about anybody else's drawer.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const { searchParams } = new URL(request.url);
  const tempIds = searchParams.getAll("tempId");

  if (tempIds.length === 0) {
    return successResponse({ status: "ok", resolvedIds: {} });
  }

  // Check if any of the tempIds have been synced (have serverIds)
  const { listOfflineLocalEntities } = await import("@corelithzw/module-offline/entity-store");
  const entities = await listOfflineLocalEntities({
    moduleId: "retail-pos",
  });

  const resolvedIds: Record<string, string> = {};
  for (const entity of entities) {
    if (tempIds.includes(entity.tempId) && entity.serverId) {
      resolvedIds[entity.tempId] = entity.serverId;
    }
  }

  return successResponse({
    status: "ok",
    resolvedIds,
    pendingCount: tempIds.length - Object.keys(resolvedIds).length,
  });
}
