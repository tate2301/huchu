/**
 * Offline Sale Processing
 * ---------------------------------------------------------------------------
 * Manages sale creation, void, and refund operations in offline mode.
 * All mutations are queued to the outbox for background sync.
 *
 * Dependency ordering: sales depend on shifts (and optionally customers)
 * being synced first. This is enforced via the dependsOn field.
 */

import {
  enqueueOfflineOperation,
  listOfflineOperationsForModule,
  findOfflineOperationForLocalEntity,
} from "@/lib/offline/outbox";
import type { OfflineTenantKey, OfflineOutboxOperation } from "@/lib/offline/types";
import type { POSSalePayload } from "./offline-bootstrap";
import { isOfflineRetailCustomerId } from "./offline-runtime";

export type { POSSalePayload };

type POSSaleOutboxOperation = Omit<OfflineOutboxOperation, "payload"> & {
  payload: POSSalePayload;
};

// ── Constants ───────────────────────────────────────────────────────────────

const RETAIL_POS_OFFLINE_MODULE_ID = "retail-pos";

let localSaleCounter = 0;

function generateSaleNo(): string {
  const timestamp = Date.now();
  localSaleCounter = (localSaleCounter + 1) % 1000;
  return `RSL-${timestamp}-${String(localSaleCounter).padStart(3, "0")}`;
}

// ── Outbox Payload Builders ─────────────────────────────────────────────────

export interface OfflineSaleInput {
  shiftId: string;
  siteId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  items: POSSalePayload["items"];
  payments: POSSalePayload["payments"];
  subtotal: number;
  discountAmount: number;
  taxTotal: number;
  grandTotal: number;
  cashTendered?: number;
  changeDue?: number;
  promotionId?: string;
  promotionName?: string;
  overrideReason?: string;
  receiptPrinted: boolean;
  receiptTemplate: string;
  deviceId: string;
}

export interface OfflineVoidInput {
  saleId: string;
  reason: string;
  voidedAt: string;
}

export interface OfflineRefundInput {
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
}

// ── Dependency Resolution ───────────────────────────────────────────────────

/**
 * Resolve dependencies for a sale operation.
 * Sales depend on:
 *   1. The shift being synced (if shift is a tempId)
 *   2. The customer being synced (if customer is an offline tempId)
 */
async function resolveSaleDependencies(
  tenantKey: OfflineTenantKey,
  input: { shiftId: string; customerId?: string }
): Promise<string[]> {
  const dependencies: string[] = [];

  // Check shift dependency
  if (isTempShiftId(input.shiftId)) {
    const shiftOp = await findOfflineOperationForLocalEntity(
      RETAIL_POS_OFFLINE_MODULE_ID,
      tenantKey,
      input.shiftId,
      "open-shift"
    );
    if (shiftOp && shiftOp.status !== "SYNCED") {
      dependencies.push(shiftOp.operationId);
    }
  }

  // Check customer dependency
  if (input.customerId && isOfflineRetailCustomerId(input.customerId)) {
    const customerOp = await findOfflineOperationForLocalEntity(
      RETAIL_POS_OFFLINE_MODULE_ID,
      tenantKey,
      input.customerId,
      "create-customer"
    );
    if (customerOp && customerOp.status !== "SYNCED") {
      dependencies.push(customerOp.operationId);
    }
  }

  return dependencies;
}

function isTempShiftId(shiftId: string): boolean {
  return shiftId.startsWith("local:retail-pos:shift:");
}

// ── Sale Creation ───────────────────────────────────────────────────────────

/**
 * Create a sale offline.
 * 1. Generates a local sale number
 * 2. Resolves dependencies (shift + customer must be synced first)
 * 3. Queues a "create-sale" operation in the outbox
 * 4. Returns the queued operation
 */
export async function createSaleOffline(
  tenantKey: OfflineTenantKey,
  input: OfflineSaleInput
): Promise<{
  saleNo: string;
  operation: POSSaleOutboxOperation;
}> {
  const saleNo = generateSaleNo();

  // Resolve dependencies
  const dependencies = await resolveSaleDependencies(tenantKey, {
    shiftId: input.shiftId,
    customerId: input.customerId,
  });

  const payload: POSSalePayload = {
    saleNo,
    shiftId: input.shiftId,
    siteId: input.siteId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    items: input.items,
    payments: input.payments,
    subtotal: input.subtotal,
    discountAmount: input.discountAmount,
    taxTotal: input.taxTotal,
    grandTotal: input.grandTotal,
    cashTendered: input.cashTendered,
    changeDue: input.changeDue,
    promotionId: input.promotionId,
    promotionName: input.promotionName,
    overrideReason: input.overrideReason,
    receiptPrinted: input.receiptPrinted,
    receiptTemplate: input.receiptTemplate,
    offlineCreated: true,
    offlineCreatedAt: new Date().toISOString(),
    deviceId: input.deviceId,
  };

  const localRefs: Record<string, string> = {};
  if (input.customerId && isOfflineRetailCustomerId(input.customerId)) {
    localRefs.customerId = input.customerId;
  }

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: saleNo,
    entityType: "retail-sale",
    operation: "create-sale",
    dependsOn: dependencies,
    payload: payload as unknown as Record<string, unknown>,
    localRefs: Object.keys(localRefs).length > 0 ? localRefs : undefined,
    attachments: [],
    syncPriority: 20,
  });

  return { saleNo, operation: operation as unknown as POSSaleOutboxOperation };
}

// ── Sale Void ───────────────────────────────────────────────────────────────

/**
 * Void a sale offline.
 * Queues a "void-sale" operation in the outbox.
 * The void cannot be processed until the original sale is synced.
 */
export async function voidSaleOffline(
  tenantKey: OfflineTenantKey,
  input: OfflineVoidInput
): Promise<OfflineOutboxOperation> {
  const payload = {
    saleId: input.saleId,
    reason: input.reason,
    voidedAt: input.voidedAt,
    offlineCreated: true,
    offlineCreatedAt: new Date().toISOString(),
  };

  // If the saleId is a local tempId, we need to find its operation
  let dependencies: string[] = [];
  if (input.saleId.startsWith("local:")) {
    const saleOp = await findOfflineOperationForLocalEntity(
      RETAIL_POS_OFFLINE_MODULE_ID,
      tenantKey,
      input.saleId,
      "create-sale"
    );
    if (saleOp && saleOp.status !== "SYNCED") {
      dependencies.push(saleOp.operationId);
    }
  }

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: `void:${input.saleId}:${Date.now()}`,
    entityType: "retail-sale",
    operation: "void-sale",
    dependsOn: dependencies,
    payload,
    attachments: [],
    syncPriority: 25, // Lower priority than sale creation
  });

  return operation;
}

// ── Sale Refund ─────────────────────────────────────────────────────────────

/**
 * Refund a sale offline.
 * Queues a "refund-sale" operation in the outbox.
 * The refund cannot be processed until the original sale is synced.
 */
export async function refundSaleOffline(
  tenantKey: OfflineTenantKey,
  input: OfflineRefundInput
): Promise<OfflineOutboxOperation> {
  const payload = {
    saleId: input.saleId,
    items: input.items,
    reason: input.reason,
    refundTotal: input.refundTotal,
    originalSaleNo: input.originalSaleNo,
    offlineCreated: true,
    offlineCreatedAt: new Date().toISOString(),
  };

  // If the saleId is a local tempId, we need to find its operation
  let dependencies: string[] = [];
  if (input.saleId.startsWith("local:")) {
    const saleOp = await findOfflineOperationForLocalEntity(
      RETAIL_POS_OFFLINE_MODULE_ID,
      tenantKey,
      input.saleId,
      "create-sale"
    );
    if (saleOp && saleOp.status !== "SYNCED") {
      dependencies.push(saleOp.operationId);
    }
  }

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: RETAIL_POS_OFFLINE_MODULE_ID,
    clientRequestId: `refund:${input.saleId}:${Date.now()}`,
    entityType: "retail-sale",
    operation: "refund-sale",
    dependsOn: dependencies,
    payload,
    attachments: [],
    syncPriority: 25, // Lower priority than sale creation
  });

  return operation;
}

// ── Pending Sales ───────────────────────────────────────────────────────────

/**
 * List all queued offline sales (pending sync).
 */
export async function getPendingSales(
  tenantKey: OfflineTenantKey
): Promise<POSSaleOutboxOperation[]> {
  const operations = await listOfflineOperationsForModule(
    RETAIL_POS_OFFLINE_MODULE_ID,
    tenantKey
  );

  return operations
    .filter((op) => op.operation === "create-sale" && op.status !== "SYNCED")
    .map((op) => op as unknown as POSSaleOutboxOperation);
}

/**
 * List all pending operations (sales, voids, refunds).
 */
export async function getAllPendingSaleOperations(
  tenantKey: OfflineTenantKey
): Promise<OfflineOutboxOperation[]> {
  return listOfflineOperationsForModule(RETAIL_POS_OFFLINE_MODULE_ID, tenantKey);
}

/**
 * Get count of pending sales for the queue badge.
 */
export async function getPendingSaleCount(tenantKey: OfflineTenantKey): Promise<number> {
  const pending = await getPendingSales(tenantKey);
  return pending.length;
}

// ── Local Receipt Generation ────────────────────────────────────────────────

export interface LocalReceiptInput {
  saleNo: string;
  storeName: string;
  storeAddress?: string;
  cashierName: string;
  dateTime: string;
  items: Array<{
    name: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  subtotal: number;
  discount?: number;
  tax: number;
  total: number;
  payments: Array<{
    type: string;
    amount: number;
  }>;
  change?: number;
}

/**
 * Generate a local receipt for an offline sale.
 * Returns structured receipt data ready for printing/PDF.
 */
export async function generateLocalReceipt(
  saleData: LocalReceiptInput
): Promise<{
  receiptNo: string;
  receiptData: string; // formatted plain text for thermal printer
  receiptHtml: string; // HTML for display/PDF
}> {
  const receiptNo = `R-${saleData.saleNo}`;

  // Plain text format for thermal printer (58mm/80mm)
  const textLines: string[] = [
    saleData.storeName.toUpperCase(),
    saleData.storeAddress ?? "",
    "-".repeat(32),
    `Receipt: ${receiptNo}`,
    `Date: ${new Date(saleData.dateTime).toLocaleString()}`,
    `Cashier: ${saleData.cashierName}`,
    "-".repeat(32),
    ...saleData.items.map(
      (item) =>
        `${item.name.substring(0, 24).padEnd(24)} ${String(item.qty).padStart(3)} x ${item.unitPrice.toFixed(2).padStart(6)}`
    ),
    "-".repeat(32),
    `Subtotal: ${saleData.subtotal.toFixed(2).padStart(20)}`,
  ];

  if (saleData.discount) {
    textLines.push(`Discount: -${saleData.discount.toFixed(2).padStart(19)}`);
  }

  textLines.push(
    `Tax: ${saleData.tax.toFixed(2).padStart(26)}`,
    `TOTAL: ${saleData.total.toFixed(2).padStart(22)}`,
    "-".repeat(32)
  );

  for (const payment of saleData.payments) {
    textLines.push(
      `${payment.type.padEnd(24)} ${payment.amount.toFixed(2).padStart(8)}`
    );
  }

  if (saleData.change) {
    textLines.push(`Change: ${saleData.change.toFixed(2).padStart(23)}`);
  }

  textLines.push(
    "-".repeat(32),
    "Pending sync — will upload",
    "when connection is restored",
    "",
    "Thank you for your purchase!",
    ""
  );

  const receiptData = textLines.join("\n");

  // HTML format for display/PDF
  const receiptHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @media print {
      body { width: 80mm; margin: 0; padding: 4mm; font-family: monospace; }
    }
    body { font-family: 'Courier New', monospace; font-size: 12px; max-width: 400px; margin: 0 auto; padding: 16px; }
    .center { text-align: center; }
    .divider { border-top: 1px dashed #000; margin: 8px 0; }
    .line { display: flex; justify-content: space-between; margin: 2px 0; }
    .total { font-weight: bold; font-size: 14px; }
    .pending { color: #f59e0b; font-style: italic; }
    .footer { margin-top: 16px; text-align: center; }
  </style>
</head>
<body>
  <div class="center">
    <strong>${escapeHtml(saleData.storeName)}</strong>
    ${saleData.storeAddress ? `<br>${escapeHtml(saleData.storeAddress)}` : ""}
  </div>
  <div class="divider"></div>
  <div class="line"><span>Receipt</span><span>${receiptNo}</span></div>
  <div class="line"><span>Date</span><span>${new Date(saleData.dateTime).toLocaleString()}</span></div>
  <div class="line"><span>Cashier</span><span>${escapeHtml(saleData.cashierName)}</span></div>
  <div class="divider"></div>
  ${saleData.items
    .map(
      (item) => `
    <div class="line">
      <span>${escapeHtml(item.name.substring(0, 24))}</span>
    </div>
    <div class="line">
      <span>${item.qty} x ${item.unitPrice.toFixed(2)}</span>
      <span>${item.total.toFixed(2)}</span>
    </div>
  `
    )
    .join("")}
  <div class="divider"></div>
  <div class="line"><span>Subtotal</span><span>${saleData.subtotal.toFixed(2)}</span></div>
  ${saleData.discount ? `<div class="line"><span>Discount</span><span>-${saleData.discount.toFixed(2)}</span></div>` : ""}
  <div class="line"><span>Tax</span><span>${saleData.tax.toFixed(2)}</span></div>
  <div class="line total"><span>TOTAL</span><span>${saleData.total.toFixed(2)}</span></div>
  <div class="divider"></div>
  ${saleData.payments
    .map((p) => `<div class="line"><span>${p.type}</span><span>${p.amount.toFixed(2)}</span></div>`)
    .join("")}
  ${saleData.change ? `<div class="line"><span>Change</span><span>${saleData.change.toFixed(2)}</span></div>` : ""}
  <div class="divider"></div>
  <div class="pending center">Pending sync — will upload when online</div>
  <div class="footer">
    Thank you for your purchase!
  </div>
</body>
</html>`;

  return { receiptNo, receiptData, receiptHtml };
}

function escapeHtml(text: string): string {
  const div = typeof document !== "undefined" ? document.createElement("div") : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ── Sale Validation ─────────────────────────────────────────────────────────

/**
 * Validate sale data before creating an offline sale.
 */
export function validateOfflineSale(input: OfflineSaleInput): string | null {
  if (!input.shiftId) return "Shift is required";
  if (!input.siteId) return "Site is required";
  if (!input.items.length) return "At least one item is required";
  if (!input.payments.length) return "At least one payment is required";

  const totalPayments = input.payments.reduce((sum, p) => sum + p.amount, 0);
  if (totalPayments < input.grandTotal - 0.01) {
    return "Payment total is less than grand total";
  }

  // Card payments are not allowed offline
  const hasCardPayment = input.payments.some((p) => p.tenderType === "CARD");
  if (hasCardPayment) {
    return "Card payments require an internet connection";
  }

  return null;
}
