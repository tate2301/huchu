/**
 * Scrap Metal Sync API Endpoint
 *
 * Accepts batched offline operations from the client and processes them
 * in the correct order: sellers → purchase tickets → sales batches.
 * Handles attachment uploads, compliance validation, and atomic batch processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { captureAccountingEvent } from "@/lib/accounting/integration";
import { applyScrapBalanceDelta } from "@/lib/scrap-metal";
import {
  parseScrapTicketPhotosJson,
  serializeScrapTicketPhotos,
} from "@/lib/scrap-metal/attachments";
import { resolveScrapTicketComplianceRequirements } from "@/lib/scrap-metal/compliance-rules";
import { validateScrapTicketCompliance } from "@/lib/scrap-metal/compliance-validation";

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------

const syncOperationSchema = z.object({
  operationId: z.string(),
  operation: z.enum([
    "create-seller",
    "create-inbound-ticket",
    "create-outbound-ticket",
    "create-batch",
    "add-ticket-to-batch",
    "flag-compliance-issue",
  ]),
  clientRequestId: z.string(),
  entityType: z.string(),
  payload: z.record(z.unknown()),
  localRefs: z.record(z.string()).optional(),
  attachments: z
    .array(
      z.object({
        tenantKey: z.string(),
        attachmentId: z.string(),
        context: z.string(),
        fileName: z.string(),
        contentType: z.string(),
        size: z.number(),
      }),
    )
    .optional(),
  dependsOn: z.array(z.string()).optional(),
  retryCount: z.number().optional(),
});

const syncRequestSchema = z.object({
  tenantKey: z.string(),
  operations: z.array(syncOperationSchema),
  deviceId: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface SyncOperationResult {
  operationId: string;
  status: "synced" | "retryable" | "blocking";
  serverEntityId?: string;
  error?: string;
  retryAfter?: number;
}

// ---------------------------------------------------------------------------
// Operation processors
// ---------------------------------------------------------------------------

/**
 * Process create-seller operation.
 */
async function processCreateSeller(
  tx: typeof prisma,
  companyId: string,
  session: { user: { id: string; companyId: string } },
  payload: Record<string, unknown>,
): Promise<{ sellerId: string }> {
  const fullName = String(payload.fullName ?? "");
  const phone = String(payload.phone ?? "");
  const nationalId = String(payload.nationalId ?? "");
  const address = payload.address ? String(payload.address) : undefined;
  const notes = payload.notes ? String(payload.notes) : undefined;

  // Check for duplicate by nationalId
  const existing = await tx.scrapSellerProfile.findFirst({
    where: { companyId, nationalId },
    select: { id: true },
  });

  if (existing) {
    return { sellerId: existing.id };
  }

  const seller = await tx.scrapSellerProfile.create({
    data: {
      companyId,
      fullName,
      phone,
      nationalId,
      address,
      notes,
      createdById: session.user.id,
    },
    select: { id: true },
  });

  return { sellerId: seller.id };
}

/**
 * Process create-inbound-ticket (purchase) operation.
 */
async function processCreateInboundTicket(
  tx: typeof prisma,
  companyId: string,
  session: { user: { id: string; companyId: string } },
  payload: Record<string, unknown>,
): Promise<{ purchaseId: string; purchaseNumber: string }> {
  const siteId = String(payload.siteId ?? "");
  const employeeId = String(payload.employeeId ?? "");
  const sellerProfileId = String(payload.sellerProfileId ?? "");
  const materialId = payload.materialId ? String(payload.materialId) : undefined;
  const category = String(payload.category ?? "OTHER") as
    | "BATTERIES"
    | "COPPER"
    | "ALUMINUM"
    | "STEEL"
    | "BRASS"
    | "MIXED"
    | "OTHER";
  const weight = Number(payload.weight ?? 0);
  const pricePerKg = Number(payload.pricePerKg ?? 0);
  const currency = String(payload.currency ?? "USD").toUpperCase();
  const paymentMethod = payload.paymentMethod
    ? String(payload.paymentMethod).trim()
    : undefined;
  const paymentReference = payload.paymentReference
    ? String(payload.paymentReference).trim()
    : undefined;
  const notes = payload.notes ? String(payload.notes).trim() : undefined;
  const status = (String(payload.status ?? "POSTED") as "DRAFT" | "POSTED") ?? "POSTED";

  // Resolve seller (may have been created in this sync batch)
  const seller = await tx.scrapSellerProfile.findFirst({
    where: { id: sellerProfileId, companyId },
    select: { id: true, fullName: true, phone: true },
  });

  if (!seller) {
    throw new Error(`Seller profile not found: ${sellerProfileId}`);
  }

  // Validate material if provided
  if (materialId) {
    const material = await tx.scrapMaterial.findFirst({
      where: { id: materialId, companyId },
      select: { id: true, category: true, isActive: true },
    });
    if (!material) {
      throw new Error(`Material not found: ${materialId}`);
    }
    if (!material.isActive) {
      throw new Error("Material is inactive");
    }
    if (material.category !== category) {
      throw new Error("Material category mismatch");
    }
  }

  const totalAmount = weight * pricePerKg;

  // Compliance check (skip for DRAFT)
  if (status !== "DRAFT") {
    const requirements = await resolveScrapTicketComplianceRequirements(tx, {
      companyId,
      direction: "INBOUND",
      materialId: materialId ?? null,
      category,
    });

    const attachments = parseScrapTicketPhotosJson(
      payload.attachmentsJson ? String(payload.attachmentsJson) : null,
    );

    const complianceErrors = validateScrapTicketCompliance({
      requirements,
      attachmentsCount: attachments.length,
      paymentMethod,
      paymentReference,
      notes,
    });

    if (complianceErrors.length > 0) {
      throw new Error(`Compliance: ${complianceErrors.join("; ")}`);
    }
  }

  const purchaseNumber = payload.purchaseNumber
    ? normalizeProvidedId(String(payload.purchaseNumber), "SCRAP_METAL_PURCHASE")
    : await reserveIdentifier(tx, {
        companyId,
        entity: "SCRAP_METAL_PURCHASE",
        siteId,
      });

  // Check for existing purchase (idempotency)
  const existing = await tx.scrapMetalPurchase.findFirst({
    where: { companyId, purchaseNumber },
    select: { id: true, purchaseNumber: true },
  });

  if (existing) {
    return { purchaseId: existing.id, purchaseNumber: existing.purchaseNumber };
  }

  const purchase = await tx.scrapMetalPurchase.create({
    data: {
      companyId,
      siteId,
      purchaseNumber,
      purchaseDate: new Date(),
      employeeId,
      sellerProfileId: seller.id,
      materialId,
      category,
      weight,
      pricePerKg,
      totalAmount,
      currency,
      paymentMethod,
      paymentReference,
      attachmentsJson: payload.attachmentsJson
        ? String(payload.attachmentsJson)
        : null,
      sellerName: seller.fullName,
      sellerPhone: seller.phone,
      notes,
      status,
      createdById: session.user.id,
    },
    select: { id: true, purchaseNumber: true },
  });

  // Apply balance delta for POSTED tickets
  if (status === "POSTED") {
    await applyScrapBalanceDelta(tx, {
      companyId,
      employeeId,
      amountDelta: totalAmount,
      entryType: "PURCHASE",
      sourceId: purchase.id,
      note: `Purchase ${purchase.purchaseNumber}`,
      createdById: session.user.id,
    });
  }

  // Capture accounting event
  try {
    await captureAccountingEvent({
      companyId,
      sourceDomain: "scrap-metal",
      sourceAction: "purchase",
      sourceType: "SCRAP_METAL_PURCHASE",
      sourceId: purchase.id,
      entryDate: new Date(),
      description: `Scrap metal purchase ${purchase.purchaseNumber} - ${category}`,
      amount: totalAmount,
      netAmount: totalAmount,
      taxAmount: 0,
      grossAmount: totalAmount,
      currency,
      createdById: session.user.id,
      payload: { category, weight, pricePerKg, employeeId },
    });
  } catch (error) {
    console.error("[Accounting] Scrap purchase event failed:", error);
  }

  return { purchaseId: purchase.id, purchaseNumber: purchase.purchaseNumber };
}

/**
 * Process create-outbound-ticket (sale) operation.
 */
async function processCreateOutboundTicket(
  tx: typeof prisma,
  companyId: string,
  session: { user: { id: string; name: string; companyId: string } },
  payload: Record<string, unknown>,
): Promise<{ saleId: string; saleNumber: string }> {
  const siteId = String(payload.siteId ?? "");
  const batchId = String(payload.batchId ?? "");
  const materialId = payload.materialId ? String(payload.materialId) : undefined;
  const buyerName = String(payload.buyerName ?? "").trim();
  const buyerContact = payload.buyerContact
    ? String(payload.buyerContact).trim()
    : undefined;
  const recordedWeight = Number(payload.recordedWeight ?? 0);
  const soldWeight = Number(payload.soldWeight ?? 0);
  const pricePerKg = Number(payload.pricePerKg ?? 0);
  const currency = String(payload.currency ?? "USD").toUpperCase();
  const paymentMethod = payload.paymentMethod
    ? String(payload.paymentMethod).trim()
    : undefined;
  const paymentReference = payload.paymentReference
    ? String(payload.paymentReference).trim()
    : undefined;
  const notes = payload.notes ? String(payload.notes).trim() : undefined;
  const status =
    (String(payload.status ?? "PENDING_APPROVAL") as "DRAFT" | "PENDING_APPROVAL") ??
    "PENDING_APPROVAL";

  // Validate batch
  const batch = await tx.scrapMetalBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      companyId: true,
      siteId: true,
      category: true,
      status: true,
      materialId: true,
    },
  });

  if (!batch || batch.companyId !== companyId) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  if (batch.status !== "READY" && batch.status !== "COLLECTING") {
    throw new Error("Batch must be in READY or COLLECTING status");
  }

  if (batch.siteId !== siteId) {
    throw new Error("Batch and sale must be at the same site");
  }

  // Check for existing sale on batch
  const existingSale = await tx.scrapMetalSale.findFirst({
    where: {
      companyId,
      batchId,
      status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "COMPLETED"] },
    },
    select: { id: true, saleNumber: true },
  });

  if (existingSale) {
    return { saleId: existingSale.id, saleNumber: existingSale.saleNumber };
  }

  // Validate material
  const resolvedMaterialId = materialId ?? batch.materialId ?? undefined;
  let resolvedMaterialCategory = batch.category;

  if (resolvedMaterialId) {
    const material = await tx.scrapMaterial.findFirst({
      where: { id: resolvedMaterialId, companyId },
      select: { id: true, category: true, isActive: true },
    });
    if (material) {
      if (!material.isActive) throw new Error("Material is inactive");
      resolvedMaterialCategory = material.category;
    }
  }

  const weightDiscrepancy = recordedWeight - soldWeight;
  const totalAmount = soldWeight * pricePerKg;

  // Compliance check (skip for DRAFT)
  if (status !== "DRAFT") {
    const requirements = await resolveScrapTicketComplianceRequirements(tx, {
      companyId,
      direction: "OUTBOUND",
      materialId: resolvedMaterialId ?? null,
      category: resolvedMaterialCategory,
    });

    const attachments = parseScrapTicketPhotosJson(
      payload.attachmentsJson ? String(payload.attachmentsJson) : null,
    );

    const complianceErrors = validateScrapTicketCompliance({
      requirements,
      attachmentsCount: attachments.length,
      paymentMethod,
      paymentReference,
      notes,
    });

    if (complianceErrors.length > 0) {
      throw new Error(`Compliance: ${complianceErrors.join("; ")}`);
    }
  }

  const saleNumber = payload.saleNumber
    ? normalizeProvidedId(String(payload.saleNumber), "SCRAP_METAL_SALE")
    : await reserveIdentifier(tx, {
        companyId,
        entity: "SCRAP_METAL_SALE",
        siteId,
      });

  const existing = await tx.scrapMetalSale.findFirst({
    where: { companyId, saleNumber },
    select: { id: true, saleNumber: true },
  });

  if (existing) {
    return { saleId: existing.id, saleNumber: existing.saleNumber };
  }

  const sale = await tx.scrapMetalSale.create({
    data: {
      companyId,
      siteId,
      batchId,
      materialId: resolvedMaterialId,
      saleNumber,
      saleDate: new Date(),
      buyerName,
      buyerContact,
      recordedWeight,
      soldWeight,
      weightDiscrepancy,
      pricePerKg,
      totalAmount,
      currency,
      paymentMethod,
      paymentReference,
      attachmentsJson: payload.attachmentsJson
        ? String(payload.attachmentsJson)
        : null,
      status,
      notes,
      createdById: session.user.id,
    },
    select: { id: true, saleNumber: true },
  });

  return { saleId: sale.id, saleNumber: sale.saleNumber };
}

/**
 * Process create-batch operation.
 */
async function processCreateBatch(
  tx: typeof prisma,
  companyId: string,
  session: { user: { id: string } },
  payload: Record<string, unknown>,
): Promise<{ batchId: string; batchNumber: string }> {
  const siteId = String(payload.siteId ?? "");
  const category = String(payload.category ?? "OTHER") as
    | "BATTERIES"
    | "COPPER"
    | "ALUMINUM"
    | "STEEL"
    | "BRASS"
    | "MIXED"
    | "OTHER";
  const materialId = payload.materialId ? String(payload.materialId) : undefined;
  const collectionStartDate = payload.collectionStartDate
    ? new Date(String(payload.collectionStartDate))
    : new Date();
  const notes = payload.notes ? String(payload.notes).trim() : undefined;
  const batchStatus = (String(payload.status ?? "COLLECTING") as "COLLECTING" | "READY") ?? "COLLECTING";

  const batchNumber = payload.batchNumber
    ? normalizeProvidedId(String(payload.batchNumber), "SCRAP_METAL_BATCH")
    : await reserveIdentifier(tx, {
        companyId,
        entity: "SCRAP_METAL_BATCH",
        siteId,
      });

  const existing = await tx.scrapMetalBatch.findFirst({
    where: { companyId, batchNumber },
    select: { id: true, batchNumber: true },
  });

  if (existing) {
    return { batchId: existing.id, batchNumber: existing.batchNumber };
  }

  const batch = await tx.scrapMetalBatch.create({
    data: {
      companyId,
      siteId,
      materialId,
      batchNumber,
      category,
      status: batchStatus,
      collectionStartDate,
      collectionEndDate: null,
      notes,
      createdById: session.user.id,
    },
    select: { id: true, batchNumber: true },
  });

  return { batchId: batch.id, batchNumber: batch.batchNumber };
}

/**
 * Process add-ticket-to-batch association.
 */
async function processAddTicketToBatch(
  tx: typeof prisma,
  companyId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const purchaseTicketId = String(payload.purchaseTicketId ?? "");
  const batchId = String(payload.batchId ?? "");

  // Resolve IDs if they were tempIds
  const purchase = await tx.scrapMetalPurchase.findFirst({
    where: { id: purchaseTicketId, companyId },
    select: { id: true, weight: true, category: true },
  });

  if (!purchase) {
    throw new Error(`Purchase ticket not found: ${purchaseTicketId}`);
  }

  const batch = await tx.scrapMetalBatch.findUnique({
    where: { id: batchId },
    select: { id: true, companyId: true, category: true },
  });

  if (!batch || batch.companyId !== companyId) {
    throw new Error(`Batch not found: ${batchId}`);
  }

  if (batch.category !== purchase.category) {
    throw new Error("Purchase category does not match batch category");
  }

  // Create batch item association
  await tx.scrapMetalBatchItem.create({
    data: {
      batchId: batch.id,
      purchaseId: purchase.id,
    },
  });
}

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

function resolveDependencyOrder(
  operations: z.infer<typeof syncOperationSchema>[],
): z.infer<typeof syncOperationSchema>[] {
  const opMap = new Map(operations.map((op) => [op.operationId, op]));
  const visited = new Set<string>();
  const result: z.infer<typeof syncOperationSchema>[] = [];

  function visit(op: z.infer<typeof syncOperationSchema>) {
    if (visited.has(op.operationId)) return;
    visited.add(op.operationId);

    // Visit dependencies first
    for (const depId of op.dependsOn ?? []) {
      const dep = opMap.get(depId);
      if (dep) visit(dep);
    }

    result.push(op);
  }

  for (const op of operations) {
    visit(op);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = syncRequestSchema.parse(body);

    const results: SyncOperationResult[] = [];
    const serverIdMap = new Map<string, string>(); // clientRequestId → serverEntityId

    // Sort operations by dependency order
    const ordered = resolveDependencyOrder(validated.operations);

    // Process in transaction batches
    for (const op of ordered) {
      try {
        let serverEntityId: string | undefined;

        switch (op.operation) {
          case "create-seller": {
            const result = await processCreateSeller(
              prisma, session.user.companyId, session, op.payload,
            );
            serverEntityId = result.sellerId;
            // Map temp seller references
            if (op.localRefs?.entityId) {
              serverIdMap.set(op.localRefs.entityId, result.sellerId);
            }
            break;
          }

          case "create-inbound-ticket": {
            // Resolve seller tempId if needed
            const payload = { ...op.payload };
            const sellerProfileId = String(payload.sellerProfileId ?? "");
            if (serverIdMap.has(sellerProfileId)) {
              payload.sellerProfileId = serverIdMap.get(sellerProfileId)!;
            }

            const result = await processCreateInboundTicket(
              prisma, session.user.companyId, session, payload,
            );
            serverEntityId = result.purchaseId;
            break;
          }

          case "create-outbound-ticket": {
            const result = await processCreateOutboundTicket(
              prisma, session.user.companyId, session, op.payload,
            );
            serverEntityId = result.saleId;
            break;
          }

          case "create-batch": {
            const result = await processCreateBatch(
              prisma, session.user.companyId, session, op.payload,
            );
            serverEntityId = result.batchId;
            break;
          }

          case "add-ticket-to-batch": {
            // Resolve tempIds
            const payload = { ...op.payload };
            const ticketId = String(payload.purchaseTicketId ?? "");
            const batchId = String(payload.batchId ?? "");
            if (serverIdMap.has(ticketId)) {
              payload.purchaseTicketId = serverIdMap.get(ticketId)!;
            }
            if (serverIdMap.has(batchId)) {
              payload.batchId = serverIdMap.get(batchId)!;
            }

            await processAddTicketToBatch(prisma, session.user.companyId, payload);
            break;
          }

          case "flag-compliance-issue": {
            // Compliance flags are stored as notes on the ticket since
            // ScrapTicketComplianceFlag model doesn't exist yet.
            // This ensures the flag data is not lost during sync.
            const ticketId = String(op.payload.ticketId ?? "");
            const ruleId = String(op.payload.ruleId ?? "");
            const flagNotes = String(op.payload.notes ?? "");
            const severity = String(op.payload.severity ?? "warning");

            // Try to find and update the associated ticket
            if (ticketId && ticketId.startsWith("SCPUR-")) {
              // Find by purchase number
              const purchase = await tx.scrapMetalPurchase.findFirst({
                where: { companyId, purchaseNumber: ticketId },
                select: { id: true, notes: true },
              });
              if (purchase) {
                const existingNotes = purchase.notes ?? "";
                const updatedNotes = `[COMPLIANCE_FLAG: rule=${ruleId} severity=${severity}] ${flagNotes}\n${existingNotes}`;
                await tx.scrapMetalPurchase.update({
                  where: { id: purchase.id },
                  data: { notes: updatedNotes.slice(0, 1000) },
                });
              }
            }
            break;
          }

          default:
            throw new Error(`Unknown operation: ${op.operation}`);
        }

        results.push({
          operationId: op.operationId,
          status: "synced",
          serverEntityId,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sync failed";
        const isRetryable =
          message.includes("timeout") ||
          message.includes("network") ||
          message.includes("connection") ||
          message.includes("deadlock");

        results.push({
          operationId: op.operationId,
          status: isRetryable ? "retryable" : "blocking",
          error: message,
          retryAfter: isRetryable ? 5000 : undefined,
        });

        // If a seller creation fails, dependent operations should fail too
        // but we continue processing independent operations
        console.error(`[Scrap Sync] Operation ${op.operationId} failed:`, message);
      }
    }

    const synced = results.filter((r) => r.status === "synced").length;
    const failed = results.filter((r) => r.status === "blocking").length;
    const retryable = results.filter((r) => r.status === "retryable").length;

    return successResponse({
      processed: results.length,
      synced,
      failed,
      retryable,
      results,
      serverIdMap: Object.fromEntries(serverIdMap),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid sync request", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/sync error:", error);
    return errorResponse("Sync processing failed");
  }
}

/**
 * GET handler — returns sync status for the current user.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since");

    // Count pending operations by type
    const [pendingPurchases, pendingSales, pendingBatches, recentSynced] = await Promise.all([
      prisma.scrapMetalPurchase.count({
        where: {
          companyId: session.user.companyId,
          createdAt: since ? { gte: new Date(since) } : undefined,
        },
      }),
      prisma.scrapMetalSale.count({
        where: {
          companyId: session.user.companyId,
          createdAt: since ? { gte: new Date(since) } : undefined,
        },
      }),
      prisma.scrapMetalBatch.count({
        where: {
          companyId: session.user.companyId,
          createdAt: since ? { gte: new Date(since) } : undefined,
        },
      }),
      prisma.scrapMetalPurchase.findMany({
        where: {
          companyId: session.user.companyId,
          createdAt: since ? { gte: new Date(since) } : undefined,
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, purchaseNumber: true, status: true, createdAt: true },
      }),
    ]);

    return successResponse({
      summary: {
        purchases: pendingPurchases,
        sales: pendingSales,
        batches: pendingBatches,
        total: pendingPurchases + pendingSales + pendingBatches,
      },
      recent: recentSynced,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[API] GET /api/scrap-metal/sync error:", error);
    return errorResponse("Failed to fetch sync status");
  }
}
