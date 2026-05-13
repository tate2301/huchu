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
import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  requireRetailPos,
  requireRetailSession,
} from "../../_helpers";
import {
  closeRetailShiftTransaction,
  createRetailSaleTransaction,
  openRetailShiftTransaction,
  refundRetailSaleTransaction,
  voidRetailSaleTransaction,
} from "../../_services";

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

    const saleLines = payload.items.map((item) => {
      const catalogItem = catalogMap.get(item.catalogItemId);
      const inventoryItem = catalogItem
        ? inventoryMap.get(catalogItem.inventoryItemId)
        : null;
      if (!catalogItem || !inventoryItem) {
        throw new Error(`Inventory mapping missing for ${item.name}`);
      }

      return {
        inventoryItemId: inventoryItem.id,
        inventoryUnit: inventoryItem.unit,
        catalogItemId: item.catalogItemId,
        itemName: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountAmount: item.discountAmount ?? 0,
        taxAmount: item.taxAmount,
        lineTotal: item.lineTotal,
        costUnit: inventoryItem.unitCost ?? 0,
        costTotal: round(item.quantity * (inventoryItem.unitCost ?? 0)),
      };
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
      shiftId: resolvedShiftId,
      siteId: payload.siteId,
      customerName,
      subtotal: payload.subtotal,
      discountAmount: payload.discountAmount,
      taxAmount: payload.taxTotal,
      totalAmount: payload.grandTotal,
      payments: payload.payments,
      lines: saleLines,
      overrideReason: payload.overrideReason ?? null,
      notes: payload.offlineCreated
        ? `Offline replay from device ${ctx.deviceId ?? payload.deviceId ?? "unknown"}`
        : null,
      postedAt: new Date(payload.offlineCreatedAt ?? op.offlineCreatedAt ?? Date.now()),
    });

    ctx.resolvedIds.set(op.clientOperationId, sale.id);
    ctx.resolvedIds.set(payload.saleNo, sale.id);

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
      catalogItemId: string;
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
          line.catalogItemId === item.catalogItemId ||
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

// ── Main Handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPos(session);
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
