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
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import {
  canManageRetailTransactions,
  ensureSiteAccess,
  getPosSupportedPromotionTypes,
  isPosSupportedPromotionType,
  requireRetailSession,
} from "../../_helpers";

// ── Request Schemas ─────────────────────────────────────────────────────────

const syncPaymentSchema = z.object({
  tenderType: z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]),
  amount: z.number().positive(),
  reference: z.string().max(120).optional().nullable(),
});

const syncSaleItemSchema = z.object({
  catalogItemId: z.string().uuid(),
  sku: z.string(),
  name: z.string(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0),
  originalUnitPrice: z.number().min(0),
  discountAmount: z.number().min(0).optional(),
  taxRate: z.number().min(0),
  taxAmount: z.number().min(0),
  lineTotal: z.number().min(0),
});

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
    const site = await ensureSiteAccess(ctx.companyId, payload.siteId);
    if (!site) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Invalid site" };
    }

    // Check for existing open shift for this cashier
    const existingShift = await prisma.retailShift.findFirst({
      where: {
        companyId: ctx.companyId,
        cashierId: ctx.userId,
        status: "OPEN",
      },
    });

    if (existingShift) {
      // Return existing shift as the resolved entity (server wins)
      ctx.resolvedIds.set(payload.tempShiftId, existingShift.id);
      return {
        clientOperationId: op.clientOperationId,
        status: "conflict",
        serverId: existingShift.id,
        error: "An open shift already exists for this cashier",
      };
    }

    // Create new shift
    const shiftNo = await reserveIdentifier(prisma, {
      companyId: ctx.companyId,
      entity: "RETAIL_SHIFT",
      siteId: site.id,
    });

    const shift = await prisma.retailShift.create({
      data: {
        companyId: ctx.companyId,
        shiftNo,
        siteId: site.id,
        cashierId: ctx.userId,
        registerName: payload.registerName ?? "POS Register",
        registerCode: payload.registerName?.toUpperCase().replace(/\s/g, "_") ?? "POS",
        openingFloat: payload.openingCash,
        expectedCash: payload.openingCash,
        actualCash: 0,
        status: "OPEN",
        openedAt: new Date(payload.openedAt),
      },
    });

    ctx.resolvedIds.set(payload.tempShiftId, shift.id);

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: shift.id,
      saleNo: shift.shiftNo,
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
    // Resolve shiftId if it's a tempId
    const resolvedShiftId = ctx.resolvedIds.get(payload.shiftId) ?? payload.shiftId;

    const shift = await prisma.retailShift.findFirst({
      where: {
        id: resolvedShiftId,
        companyId: ctx.companyId,
        cashierId: ctx.userId,
        status: "OPEN",
      },
    });

    if (!shift) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Open shift not found" };
    }

    const updated = await prisma.retailShift.update({
      where: { id: shift.id },
      data: {
        status: "CLOSED",
        actualCash: payload.closingCash,
        closingNotes: payload.closingNotes ?? null,
        closedAt: new Date(payload.closedAt),
      },
    });

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: updated.id,
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
        nationalId: payload.nationalId ?? null,
        address: payload.address ?? null,
        contactName: payload.name,
      },
    });

    ctx.resolvedIds.set(payload.tempId, customer.id);

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
    saleNo: string;
    shiftId: string;
    siteId: string;
    customerId?: string;
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    items: Array<{
      catalogItemId: string;
      sku: string;
      name: string;
      quantity: number;
      unitPrice: number;
      originalUnitPrice: number;
      discountAmount?: number;
      taxRate: number;
      taxAmount: number;
      lineTotal: number;
    }>;
    subtotal: number;
    discountAmount: number;
    taxTotal: number;
    grandTotal: number;
    payments: Array<{
      tenderType: string;
      amount: number;
      reference?: string;
    }>;
    cashTendered?: number;
    changeDue?: number;
    overrideReason?: string;
    promotionId?: string;
    offlineCreatedAt?: string;
  };

  try {
    // Resolve shiftId and customerId
    const resolvedShiftId = ctx.resolvedIds.get(payload.shiftId) ?? payload.shiftId;
    const resolvedCustomerId = payload.customerId
      ? (ctx.resolvedIds.get(payload.customerId) ?? payload.customerId)
      : undefined;

    // Validate shift
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

    // Validate site
    const site = await ensureSiteAccess(ctx.companyId, payload.siteId);
    if (!site) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Invalid site" };
    }

    // Check for duplicate saleNo
    const existingSale = await prisma.retailSale.findFirst({
      where: { companyId: ctx.companyId, saleNo: payload.saleNo },
    });

    if (existingSale) {
      return {
        clientOperationId: op.clientOperationId,
        status: "conflict",
        serverId: existingSale.id,
        saleNo: existingSale.saleNo,
        error: "Sale with this number already exists",
      };
    }

    // Validate catalog items
    const catalogItemIds = payload.items.map((i) => i.catalogItemId);
    const catalogItems = await prisma.retailCatalogItem.findMany({
      where: {
        id: { in: catalogItemIds },
        companyId: ctx.companyId,
        status: "ACTIVE",
      },
    });

    if (catalogItems.length !== new Set(catalogItemIds).size) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "One or more catalog items invalid" };
    }

    // Get inventory items
    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { id: { in: catalogItems.map((c) => c.inventoryItemId) } },
      select: { id: true, itemCode: true, name: true, currentStock: true, unit: true, unitCost: true },
    });
    const inventoryMap = new Map(inventoryItems.map((i) => [i.id, i]));
    const catalogMap = new Map(catalogItems.map((c) => [c.id, c]));

    // Build sale lines
    const saleLines = payload.items.map((item) => {
      const catalogItem = catalogMap.get(item.catalogItemId);
      const inventoryItem = catalogItem
        ? inventoryMap.get(catalogItem.inventoryItemId)
        : null;

      return {
        inventoryItemId: inventoryItem?.id ?? item.catalogItemId,
        catalogItemId: item.catalogItemId,
        itemName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount ?? 0,
        taxAmount: item.taxAmount,
        lineTotal: item.lineTotal,
      };
    });

    // Calculate payment totals
    const normalizedPayments = payload.payments.map((p) => ({
      tenderType: p.tenderType,
      amount: Number(p.amount.toFixed(2)),
      reference: p.reference?.trim() || null,
    }));

    const tenderedAmount = normalizedPayments.reduce((sum, p) => sum + p.amount, 0);
    const cashTotal = normalizedPayments
      .filter((p) => p.tenderType === "CASH")
      .reduce((sum, p) => sum + p.amount, 0);
    const nonCashTotal = normalizedPayments
      .filter((p) => p.tenderType !== "CASH")
      .reduce((sum, p) => sum + p.amount, 0);
    const cashDue = Math.max(payload.grandTotal - nonCashTotal, 0);
    const changeAmount = Math.max(cashTotal - cashDue, 0);
    const netCash = cashTotal - changeAmount;

    // Resolve customer
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

    // Create the sale
    const providedCode = payload.saleNo
      ? normalizeProvidedId(payload.saleNo, "RETAIL_SALE")
      : null;

    let finalSaleNo = providedCode;
    if (!finalSaleNo) {
      finalSaleNo = await reserveIdentifier(prisma, {
        companyId: ctx.companyId,
        entity: "RETAIL_SALE",
        siteId: site.id,
      });
    }

    // Check for duplicate again (race condition)
    const dupCheck = await prisma.retailSale.findFirst({
      where: { companyId: ctx.companyId, saleNo: finalSaleNo },
    });
    if (dupCheck) {
      finalSaleNo = await reserveIdentifier(prisma, {
        companyId: ctx.companyId,
        entity: "RETAIL_SALE",
        siteId: site.id,
      });
    }

    const sale = await prisma.$transaction(async (tx) => {
      const created = await tx.retailSale.create({
        data: {
          companyId: ctx.companyId,
          saleNo: finalSaleNo!,
          shiftId: shift.id,
          siteId: site.id,
          cashierId: ctx.userId,
          cashierName: ctx.session.user.name || ctx.session.user.email || "Cashier",
          customerName,
          customerPhone: payload.customerPhone ?? null,
          customerEmail: payload.customerEmail?.toLowerCase() ?? null,
          subtotal: payload.subtotal,
          discountAmount: payload.discountAmount,
          taxAmount: payload.taxTotal,
          totalAmount: payload.grandTotal,
          tenderedAmount: tenderedAmount,
          changeAmount: changeAmount,
          overrideReason: payload.overrideReason ?? null,
          status: "POSTED",
          postedAt: new Date(payload.offlineCreatedAt ?? Date.now()),
          tenderSummary: normalizedPayments,
          lines: {
            create: saleLines,
          },
          payments: {
            create: normalizedPayments,
          },
        },
        include: { lines: true, payments: true },
      });

      // Update inventory
      for (const line of saleLines) {
        await tx.inventoryItem.updateMany({
          where: { id: line.inventoryItemId },
          data: {
            currentStock: { decrement: line.quantity },
          },
        });
      }

      // Update shift expected cash
      if (netCash !== 0) {
        await tx.retailShift.updateMany({
          where: { id: shift.id, companyId: ctx.companyId },
          data: { expectedCash: { increment: netCash } },
        });
      }

      return created;
    });

    return {
      clientOperationId: op.clientOperationId,
      status: "synced",
      serverId: sale.id,
      saleNo: sale.saleNo,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create sale";
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { clientOperationId: op.clientOperationId, status: "conflict", error: "Sale already exists" };
    }
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
  };

  try {
    const sale = await prisma.retailSale.findFirst({
      where: {
        id: payload.saleId,
        companyId: ctx.companyId,
        status: "POSTED",
      },
      include: { lines: true, payments: true },
    });

    if (!sale) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Sale not found" };
    }

    await prisma.$transaction(async (tx) => {
      // Create void sale record
      await tx.retailSale.create({
        data: {
          companyId: ctx.companyId,
          saleNo: `${sale.saleNo}-VOID`,
          shiftId: sale.shiftId,
          siteId: sale.siteId,
          cashierId: ctx.userId,
          cashierName: ctx.session.user.name || ctx.session.user.email || "Cashier",
          customerName: sale.customerName,
          totalAmount: -sale.totalAmount,
          subtotal: -sale.subtotal,
          discountAmount: sale.discountAmount,
          taxAmount: -sale.taxAmount,
          status: "POSTED",
          saleType: "VOID",
          sourceSaleId: sale.id,
          voidReason: payload.reason,
          postedAt: new Date(payload.voidedAt),
          lines: {
            create: sale.lines.map((line) => ({
              inventoryItemId: line.inventoryItemId,
              catalogItemId: line.catalogItemId,
              itemName: line.itemName,
              quantity: -line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxAmount: -line.taxAmount,
              lineTotal: -line.lineTotal,
            })),
          },
          payments: {
            create: sale.payments.map((p) => ({
              tenderType: p.tenderType,
              amount: -p.amount,
              reference: p.reference,
            })),
          },
        },
      });

      // Mark original sale as voided
      await tx.retailSale.update({
        where: { id: sale.id },
        data: { status: "VOIDED", voidReason: payload.reason },
      });

      // Restore inventory
      for (const line of sale.lines) {
        await tx.inventoryItem.updateMany({
          where: { id: line.inventoryItemId },
          data: { currentStock: { increment: line.quantity } },
        });
      }
    });

    return { clientOperationId: op.clientOperationId, status: "synced", serverId: sale.id };
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
    items: Array<{
      catalogItemId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      refundAmount: number;
    }>;
    reason: string;
    refundTotal: number;
    originalSaleNo?: string;
  };

  try {
    const sale = await prisma.retailSale.findFirst({
      where: {
        id: payload.saleId,
        companyId: ctx.companyId,
        status: "POSTED",
      },
    });

    if (!sale) {
      return { clientOperationId: op.clientOperationId, status: "failed", error: "Original sale not found" };
    }

    const refundNo = await reserveIdentifier(prisma, {
      companyId: ctx.companyId,
      entity: "RETAIL_SALE",
      siteId: sale.siteId,
    });

    const refund = await prisma.retailSale.create({
      data: {
        companyId: ctx.companyId,
        saleNo: refundNo,
        shiftId: sale.shiftId,
        siteId: sale.siteId,
        cashierId: ctx.userId,
        cashierName: ctx.session.user.name || ctx.session.user.email || "Cashier",
        customerName: sale.customerName,
        totalAmount: -Math.abs(payload.refundTotal),
        subtotal: -Math.abs(payload.refundTotal),
        taxAmount: 0,
        status: "POSTED",
        saleType: "REFUND",
        sourceSaleId: sale.id,
        notes: payload.reason,
        postedAt: new Date(),
        lines: {
          create: payload.items.map((item) => ({
            inventoryItemId: item.catalogItemId,
            catalogItemId: item.catalogItemId,
            itemName: item.name,
            quantity: -item.quantity,
            unitPrice: item.unitPrice,
            discountAmount: 0,
            taxAmount: 0,
            lineTotal: -item.refundAmount,
          })),
        },
        payments: {
          create: [{
            tenderType: "CASH",
            amount: Math.abs(payload.refundTotal),
            reference: `Refund for ${payload.originalSaleNo ?? sale.saleNo}`,
          }],
        },
      },
    });

    return { clientOperationId: op.clientOperationId, status: "synced", serverId: refund.id };
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
      catalogItemId: string;
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
    for (const dep of op.dependsOn) {
      inDegree.set(op.clientOperationId, (inDegree.get(op.clientOperationId) ?? 0) + 1);
    }
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

// ── Main Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

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
    }

    return successResponse({
      results,
      summary: {
        total: results.length,
        synced: results.filter((r) => r.status === "synced").length,
        conflicts: results.filter((r) => r.status === "conflict").length,
        failed: results.filter((r) => r.status === "failed").length,
        skipped: results.filter((r) => r.status === "skipped").length,
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

  const { searchParams } = new URL(request.url);
  const tempIds = searchParams.getAll("tempId");

  if (tempIds.length === 0) {
    return successResponse({ status: "ok", resolvedIds: {} });
  }

  // Check if any of the tempIds have been synced (have serverIds)
  const { listOfflineLocalEntities } = await import("@/lib/offline/entity-store");
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
