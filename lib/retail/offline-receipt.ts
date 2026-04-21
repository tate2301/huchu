/**
 * Local Receipt Generation
 * ---------------------------------------------------------------------------
 * Generates receipt data and formats for thermal printer output
 * and PDF generation. Works fully offline using cached store info.
 *
 * Receipt numbering uses a local sequence that is reconciled on sync.
 */

import { OFFLINE_DB_STORES } from "@/lib/offline/db";
import { putRecord, getRecord } from "@/lib/offline/db-v2";
import type { POSReceiptData, POSSalePayload } from "./offline-bootstrap";

export type { POSReceiptData };

// ── Constants ──────────────────────────────────────────────────────────────

const RECEIPT_NUMBER_KEY = "pos_offline_receipt_sequence";
const RECEIPT_TEMPLATE_KEY = "pos_offline_receipt_template";
const RECEIPT_HISTORY_KEY = "pos_offline_receipt_history";

const DEFAULT_RECEIPT_WIDTH = 48; // characters for 80mm thermal paper
const COMPACT_RECEIPT_WIDTH = 32; // characters for 58mm thermal paper

// ── Receipt Numbering ───────────────────────────────────────────────────────

interface ReceiptSequence {
  lastNumber: number;
  prefix: string;
  updatedAt: number;
}

/**
 * Get the next local receipt number.
 * Format: R-{prefix}-{sequence} (e.g., R-LOCAL-0001)
 */
export async function getNextReceiptNumber(): Promise<string> {
  const sequence = await getReceiptSequence();
  const nextNumber = sequence.lastNumber + 1;

  // Update sequence
  await saveReceiptSequence({
    ...sequence,
    lastNumber: nextNumber,
  });

  return `${sequence.prefix}-${String(nextNumber).padStart(4, "0")}`;
}

async function getReceiptSequence(): Promise<ReceiptSequence> {
  try {
    const record = await getRecord<ReceiptSequence>(
      OFFLINE_DB_STORES.queryCache,
      RECEIPT_NUMBER_KEY
    );
    if (record) return record;
  } catch {
    // Fall through to default
  }

  return {
    lastNumber: 0,
    prefix: "LOCAL",
    updatedAt: Date.now(),
  };
}

async function saveReceiptSequence(sequence: ReceiptSequence): Promise<void> {
  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: RECEIPT_NUMBER_KEY,
    tenantKey: "",
    queryKey: [RECEIPT_NUMBER_KEY],
    data: { ...sequence, updatedAt: Date.now() },
    updatedAt: Date.now(),
    maxAgeMs: 365 * 24 * 60 * 60 * 1000, // 1 year
    moduleId: "retail-pos",
  });
}

// ── Receipt Template ────────────────────────────────────────────────────────

export interface ReceiptTemplate {
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  taxId?: string;
  footerMessage: string;
  logoUrl?: string;
  showBarcode: boolean;
  paperWidth: "58mm" | "80mm";
}

const DEFAULT_TEMPLATE: ReceiptTemplate = {
  storeName: "Store",
  storeAddress: "",
  storePhone: "",
  storeEmail: "",
  taxId: "",
  footerMessage: "Thank you for your purchase!",
  showBarcode: true,
  paperWidth: "80mm",
};

/**
 * Cache the receipt template (store info) for offline use.
 */
export async function cacheReceiptTemplate(template: ReceiptTemplate): Promise<void> {
  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: RECEIPT_TEMPLATE_KEY,
    tenantKey: "",
    queryKey: [RECEIPT_TEMPLATE_KEY],
    data: template,
    updatedAt: Date.now(),
    maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    moduleId: "retail-pos",
  });
}

/**
 * Get the cached receipt template.
 */
export async function getReceiptTemplate(): Promise<ReceiptTemplate> {
  try {
    const record = await getRecord<ReceiptTemplate>(
      OFFLINE_DB_STORES.queryCache,
      RECEIPT_TEMPLATE_KEY
    );
    return record ?? DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

// ── Receipt Generation ──────────────────────────────────────────────────────

export interface ReceiptGenerationInput {
  saleNo: string;
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
  customerName?: string;
  syncStatus?: "PENDING_SYNC" | "SYNCED";
}

/**
 * Generate receipt data from sale information.
 * Returns a structured receipt ready for formatting.
 */
export async function generateReceipt(
  input: ReceiptGenerationInput
): Promise<POSReceiptData> {
  const template = await getReceiptTemplate();
  const receiptNo = await getNextReceiptNumber();

  return {
    receiptNo: `R-${receiptNo}`,
    saleNo: input.saleNo,
    storeName: template.storeName,
    storeAddress: template.storeAddress,
    storePhone: template.storePhone,
    cashierName: input.cashierName,
    dateTime: input.dateTime,
    items: input.items,
    subtotal: input.subtotal,
    discount: input.discount,
    tax: input.tax,
    total: input.total,
    payments: input.payments,
    change: input.change,
    footer: template.footerMessage,
    syncStatus: input.syncStatus ?? "PENDING_SYNC",
    syncTimeEstimate: input.syncStatus === "SYNCED" ? undefined : "Will sync when online",
    barcode: template.showBarcode ? input.saleNo : undefined,
  };
}

/**
 * Generate receipt data from a POS sale payload.
 */
export async function generateReceiptFromSalePayload(
  payload: POSSalePayload,
  cashierName: string
): Promise<POSReceiptData> {
  const items = payload.items.map((item) => ({
    name: item.name,
    qty: item.quantity,
    unitPrice: item.unitPrice,
    total: item.lineTotal,
  }));

  const payments = payload.payments.map((p) => ({
    type: p.tenderType,
    amount: p.amount,
  }));

  return generateReceipt({
    saleNo: payload.saleNo,
    cashierName,
    dateTime: payload.offlineCreatedAt,
    items,
    subtotal: payload.subtotal,
    discount: payload.discountAmount,
    tax: payload.taxTotal,
    total: payload.grandTotal,
    payments,
    change: payload.changeDue,
    customerName: payload.customerName,
    syncStatus: "PENDING_SYNC",
  });
}

// ── Thermal Printer Formatting ──────────────────────────────────────────────

/**
 * Format receipt for thermal printer output.
 * Produces plain text with proper alignment for 58mm or 80mm paper.
 */
export function formatReceiptForPrint(
  receipt: POSReceiptData,
  options?: { paperWidth?: "58mm" | "80mm" }
): string {
  const width =
    options?.paperWidth === "58mm" ? COMPACT_RECEIPT_WIDTH : DEFAULT_RECEIPT_WIDTH;

  const lines: string[] = [];
  const center = (text: string) => centerText(text, width);
  const divider = () => "-".repeat(width);
  const lr = (left: string, right: string) => leftRight(left, right, width);

  // Header
  lines.push("");
  lines.push(center(receipt.storeName.toUpperCase()));
  if (receipt.storeAddress) {
    lines.push(center(receipt.storeAddress));
  }
  if (receipt.storePhone) {
    lines.push(center(receipt.storePhone));
  }
  lines.push(divider());

  // Receipt info
  lines.push(lr("Receipt:", receipt.receiptNo));
  lines.push(lr("Date:", new Date(receipt.dateTime).toLocaleString()));
  lines.push(lr("Cashier:", receipt.cashierName));
  if (receipt.saleNo) {
    lines.push(lr("Sale No:", receipt.saleNo));
  }
  lines.push(divider());

  // Items header
  lines.push(lr("Item", "Qty x Price  Total"));
  lines.push(divider());

  // Items
  for (const item of receipt.items) {
    const name = item.name.length > width - 12 ? item.name.substring(0, width - 12) : item.name;
    lines.push(name);
    lines.push(
      lr(
        `  ${item.qty} x ${item.unitPrice.toFixed(2)}`,
        item.total.toFixed(2)
      )
    );
  }

  lines.push(divider());

  // Totals
  lines.push(lr("Subtotal:", receipt.subtotal.toFixed(2)));
  if (receipt.discount && receipt.discount > 0) {
    lines.push(lr("Discount:", `-${receipt.discount.toFixed(2)}`));
  }
  lines.push(lr("Tax:", receipt.tax.toFixed(2)));
  lines.push(lr("TOTAL:", receipt.total.toFixed(2)));
  lines.push(divider());

  // Payments
  for (const payment of receipt.payments) {
    lines.push(lr(`${payment.type}:`, payment.amount.toFixed(2)));
  }

  if (receipt.change && receipt.change > 0) {
    lines.push(lr("Change:", receipt.change.toFixed(2)));
  }

  lines.push(divider());

  // Sync status
  if (receipt.syncStatus === "PENDING_SYNC") {
    lines.push(center("* PENDING SYNC *"));
    lines.push(center("Will upload when online"));
    lines.push(divider());
  }

  // Footer
  if (receipt.barcode) {
    lines.push(center(`*${receipt.barcode}*`));
  }
  lines.push(center(receipt.footer));
  lines.push("");
  lines.push(center("."));
  lines.push("");

  return lines.join("\n");
}

// ── PDF Generation ──────────────────────────────────────────────────────────

/**
 * Generate a PDF blob from receipt data.
 * Uses a lightweight HTML-to-PDF approach via browser print.
 */
export function generateReceiptPDF(receipt: POSReceiptData): Blob {
  const html = generateReceiptHTML(receipt);

  // Create a Blob with the HTML content
  // In production, use a library like jspdf or html2pdf.js
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  return blob;
}

/**
 * Generate receipt HTML for display, email, or PDF conversion.
 */
export function generateReceiptHTML(receipt: POSReceiptData): string {
  const itemRows = receipt.items
    .map(
      (item) => `
    <tr>
      <td class="name">${escapeHtml(item.name)}</td>
      <td class="qty">${item.qty}</td>
      <td class="price">${item.unitPrice.toFixed(2)}</td>
      <td class="total">${item.total.toFixed(2)}</td>
    </tr>
  `
    )
    .join("");

  const paymentRows = receipt.payments
    .map(
      (p) => `
    <tr>
      <td colspan="3" class="label">${escapeHtml(p.type)}</td>
      <td class="amount">${p.amount.toFixed(2)}</td>
    </tr>
  `
    )
    .join("");

  const syncBanner =
    receipt.syncStatus === "PENDING_SYNC"
      ? `
    <div class="sync-banner">
      <span class="sync-icon">&#x23F3;</span>
      Pending Sync — Will upload when connection is restored
    </div>
  `
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt ${receipt.receiptNo}</title>
  <style>
    @page { size: 80mm auto; margin: 0; }
    @media print {
      body { width: 80mm; margin: 0; padding: 4mm; }
      .no-print { display: none; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      line-height: 1.4;
      max-width: 400px;
      margin: 0 auto;
      padding: 16px;
      color: #1a1a1a;
      background: #fff;
    }
    .header { text-align: center; margin-bottom: 12px; }
    .store-name { font-size: 16px; font-weight: bold; text-transform: uppercase; }
    .store-info { font-size: 10px; color: #666; margin-top: 2px; }
    .divider {
      border: none;
      border-top: 1px dashed #ccc;
      margin: 8px 0;
    }
    .info-row { display: flex; justify-content: space-between; font-size: 11px; }
    .items-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
    .items-table th {
      text-align: left;
      font-size: 10px;
      text-transform: uppercase;
      color: #666;
      border-bottom: 1px solid #ccc;
      padding: 2px 0;
    }
    .items-table td { padding: 2px 0; font-size: 11px; }
    .items-table .name { max-width: 140px; overflow: hidden; text-overflow: ellipsis; }
    .items-table .qty { text-align: center; width: 30px; }
    .items-table .price { text-align: right; width: 50px; }
    .items-table .total { text-align: right; width: 60px; font-weight: bold; }
    .totals { margin-top: 8px; }
    .totals .row { display: flex; justify-content: space-between; font-size: 11px; }
    .totals .total-row {
      font-size: 14px;
      font-weight: bold;
      border-top: 2px solid #1a1a1a;
      margin-top: 4px;
      padding-top: 4px;
    }
    .payments { margin-top: 8px; }
    .payments .label { text-align: left; }
    .payments .amount { text-align: right; font-weight: bold; }
    .sync-banner {
      text-align: center;
      background: #fef3c7;
      border: 1px solid #f59e0b;
      border-radius: 4px;
      padding: 6px;
      margin: 10px 0;
      font-size: 10px;
      color: #92400e;
    }
    .sync-icon { font-size: 14px; }
    .footer {
      text-align: center;
      margin-top: 12px;
      font-size: 11px;
      color: #666;
    }
    .barcode {
      text-align: center;
      font-family: 'Libre Barcode 39', monospace;
      font-size: 24px;
      margin: 8px 0;
      letter-spacing: 2px;
    }
    .no-print {
      margin-top: 20px;
      text-align: center;
    }
    .print-btn {
      background: #1a1a1a;
      color: #fff;
      border: none;
      padding: 10px 24px;
      border-radius: 6px;
      font-size: 13px;
      cursor: pointer;
      font-family: system-ui, sans-serif;
    }
    .print-btn:hover { background: #333; }
  </style>
</head>
<body>
  <div class="header">
    <div class="store-name">${escapeHtml(receipt.storeName)}</div>
    ${receipt.storeAddress ? `<div class="store-info">${escapeHtml(receipt.storeAddress)}</div>` : ""}
    ${receipt.storePhone ? `<div class="store-info">${escapeHtml(receipt.storePhone)}</div>` : ""}
  </div>

  <hr class="divider">

  <div class="info-row"><span>Receipt:</span><span>${receipt.receiptNo}</span></div>
  <div class="info-row"><span>Date:</span><span>${new Date(receipt.dateTime).toLocaleString()}</span></div>
  <div class="info-row"><span>Cashier:</span><span>${escapeHtml(receipt.cashierName)}</span></div>
  ${receipt.saleNo ? `<div class="info-row"><span>Sale No:</span><span>${receipt.saleNo}</span></div>` : ""}

  <hr class="divider">

  <table class="items-table">
    <thead>
      <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <hr class="divider">

  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${receipt.subtotal.toFixed(2)}</span></div>
    ${receipt.discount ? `<div class="row"><span>Discount</span><span>-${receipt.discount.toFixed(2)}</span></div>` : ""}
    <div class="row"><span>Tax</span><span>${receipt.tax.toFixed(2)}</span></div>
    <div class="row total-row"><span>TOTAL</span><span>${receipt.total.toFixed(2)}</span></div>
  </div>

  <hr class="divider">

  <table class="items-table payments">
    <tbody>${paymentRows}</tbody>
    ${receipt.change ? `<tfoot><tr><td colspan="3" class="label">Change</td><td class="amount">${receipt.change.toFixed(2)}</td></tr></tfoot>` : ""}
  </table>

  ${syncBanner}

  ${receipt.barcode ? `<div class="barcode">*${receipt.barcode}*</div>` : ""}

  <div class="footer">${escapeHtml(receipt.footer)}</div>

  <div class="no-print">
    <button class="print-btn" onclick="window.print()">&#x1F5B6; Print Receipt</button>
  </div>

  <script>
    // Auto-focus for print dialog
    document.addEventListener('keydown', function(e) {
      if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        window.print();
      }
    });
  <\/script>
</body>
</html>`;
}

// ── Receipt History ─────────────────────────────────────────────────────────

export interface ReceiptHistoryEntry {
  receiptNo: string;
  saleNo: string;
  dateTime: string;
  total: number;
  syncStatus: "PENDING_SYNC" | "SYNCED";
  printed: boolean;
}

/**
 * Save a receipt to local history for later lookup.
 */
export async function saveReceiptToHistory(entry: ReceiptHistoryEntry): Promise<void> {
  const history = await getReceiptHistory();
  const updated = [entry, ...history].slice(0, 120); // Keep last 120

  await putRecord(OFFLINE_DB_STORES.queryCache, {
    id: RECEIPT_HISTORY_KEY,
    tenantKey: "",
    queryKey: [RECEIPT_HISTORY_KEY],
    data: updated,
    updatedAt: Date.now(),
    maxAgeMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    moduleId: "retail-pos",
  });
}

/**
 * Get receipt history (last 120 receipts).
 */
export async function getReceiptHistory(): Promise<ReceiptHistoryEntry[]> {
  try {
    const record = await getRecord<{ data: ReceiptHistoryEntry[] }>(
      OFFLINE_DB_STORES.queryCache,
      RECEIPT_HISTORY_KEY
    );
    return record?.data ?? [];
  } catch {
    return [];
  }
}

// ── Utility Functions ───────────────────────────────────────────────────────

function centerText(text: string, width: number): string {
  if (text.length >= width) return text;
  const padding = Math.floor((width - text.length) / 2);
  return " ".repeat(padding) + text;
}

function leftRight(left: string, right: string, width: number): string {
  const spaceNeeded = Math.max(width - left.length - right.length, 1);
  return left + " ".repeat(spaceNeeded) + right;
}

function escapeHtml(text: string): string {
  if (typeof window !== "undefined" && document) {
    const div = document.createElement("div");
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

// ── Print Helpers ───────────────────────────────────────────────────────────

/**
 * Open a print dialog with the receipt HTML.
 */
export function openReceiptPrintWindow(receipt: POSReceiptData): void {
  if (typeof window === "undefined") return;

  const html = generateReceiptHTML(receipt);
  const printWindow = window.open("", "_blank", "width=450,height=700");
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();

  // Auto-print after a short delay for resources to load
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);
}

/**
 * Generate a compact receipt suitable for SMS/email sharing.
 */
export function generateCompactReceiptText(receipt: POSReceiptData): string {
  const lines: string[] = [
    receipt.storeName,
    `Receipt: ${receipt.receiptNo}`,
    `Date: ${new Date(receipt.dateTime).toLocaleString()}`,
    "---",
    ...receipt.items.map((i) => `${i.name} x${i.qty} = ${i.total.toFixed(2)}`),
    "---",
    `Total: ${receipt.total.toFixed(2)}`,
    receipt.footer,
  ];

  if (receipt.syncStatus === "PENDING_SYNC") {
    lines.push("[Pending sync]");
  }

  return lines.join("\n");
}
