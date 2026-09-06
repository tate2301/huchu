/**
 * Huchu Retail POS — Offline Module Exports
 * ---------------------------------------------------------------------------
 * Barrel file for all POS offline functionality.
 */

// ── Core Offline Infrastructure ─────────────────────────────────────────────

export {
  // Constants
  RETAIL_POS_OFFLINE_MODULE_ID,
  // Customer
  createOfflineRetailCustomer,
  searchOfflineRetailCustomers,
  isOfflineRetailCustomerId,
  // Sale queue
  queueOfflineRetailSale,
  listOfflineRetailOperations,
} from "./offline-runtime";

export type { RetailOfflineCustomerPayload } from "./offline-runtime";

// ── Legacy Queue (localStorage-based) ───────────────────────────────────────

export {
  loadQueuedPosSales,
  queuePosSale,
  removeQueuedPosSale,
  bumpQueuedPosSaleRetry,
  failQueuedPosSale,
  markQueuedPosSaleQueued,
} from "./pos-offline-queue";

export type {
  PosSalePaymentInput,
  PosSaleQueuePayload,
  PosQueuedSale,
} from "./pos-offline-queue";

// ── Checkout Calculation ────────────────────────────────────────────────────

export {
  calculateRetailCheckout,
  calculateRetailPromotionDiscount,
} from "./checkout";

export type {
  RetailCheckoutLineInput,
  RetailCheckoutPromotion,
  RetailCalculatedCheckoutLine,
  RetailCalculatedCheckout,
  RetailPromotionType,
} from "./checkout";

// ── 3-Phase Bootstrap ───────────────────────────────────────────────────────

export {
  bootstrapPOS,
  fetchWithBootstrapRetry,
  clearPOSCache,
  // Cache accessors
  getCachedCatalog,
  getCachedCustomers,
  getCachedPromotions,
  getCachedShift,
  getCachedTenderPolicy,
  getCachedHeldCarts,
  getCachedSalesHistory,
  getCachedReceiptTemplate,
  getCachedBarcodeIndex,
  getBootstrapProgress,
} from "./offline-bootstrap";

export type {
  POSCatalogItem,
  POSCustomer,
  POSPromotion,
  POSSalePayload,
  POSShiftData,
  POSHeldCart,
  POSReceiptData,
  BootstrapRetryConfig,
  Phase1BootstrapResult,
  Phase2BootstrapResult,
  Phase3BootstrapResult,
  BootstrapProgress,
  BootstrapCallbacks,
  BootstrapPhaseResult,
} from "./offline-bootstrap";

// ── Offline Product Catalog ─────────────────────────────────────────────────

export {
  cacheCatalog,
  getCachedCatalog as getOfflineCatalog,
  getProductByBarcode,
  getProductById,
  searchCatalog,
  scanBarcode,
  mergeCatalogDelta,
  refreshCatalogFromServer,
  getCatalogSize,
  getCatalogCacheAge,
  isCatalogStale,
  getCachedCategories,
} from "./offline-catalog";

export type { CatalogSearchFilters } from "./offline-catalog";

// ── Offline Customer Management ─────────────────────────────────────────────

export {
  cacheCustomers,
  getAllCachedCustomers,
  getOfflineCreatedCustomers,
  searchCustomers,
  getCustomerById,
  getCustomerByPhone,
  getCustomerByName,
  createCustomerOffline,
  markCustomerSynced,
  resolveCustomerServerId,
  buildPhoneIndex,
} from "./offline-customer";

export type { OfflineCustomerInput } from "./offline-customer";

// ── Offline Sale Processing ─────────────────────────────────────────────────

export {
  createSaleOffline,
  voidSaleOffline,
  refundSaleOffline,
  getPendingSales,
  getAllPendingSaleOperations,
  getPendingSaleCount,
  generateLocalReceipt,
  validateOfflineSale,
} from "./offline-sale";

export type {
  OfflineSaleInput,
  OfflineVoidInput,
  OfflineRefundInput,
  LocalReceiptInput,
} from "./offline-sale";

// ── Offline Shift Management ────────────────────────────────────────────────

export {
  openShiftOffline,
  closeShiftOffline,
  cacheShift,
  getCurrentShift,
  clearCachedShift,
  isShiftReadyForSales,
  resolveShiftIdForSale,
  getOfflineShiftOperations,
  markShiftSynced,
  updateShiftMetricsAfterSale,
} from "./offline-shift";

export type {
  OfflineShiftOpenInput,
  OfflineShiftCloseInput,
} from "./offline-shift";

// ── Offline Held Carts ──────────────────────────────────────────────────────

export {
  holdCartOffline,
  recallHeldCart,
  getHeldCarts,
  getHeldCartsForShift,
  deleteHeldCart,
  markHeldCartRecalled,
  markHeldCartSynced,
  getHeldCartCount,
  getLocalHeldCartCount,
} from "./offline-held-cart";

export type { HoldCartInput } from "./offline-held-cart";

// ── Local Receipt Generation ────────────────────────────────────────────────

export {
  generateReceipt,
  generateReceiptFromSalePayload,
  formatReceiptForPrint,
  generateReceiptPDF,
  generateReceiptHTML,
  generateCompactReceiptText,
  openReceiptPrintWindow,
  cacheReceiptTemplate,
  getReceiptTemplate,
  saveReceiptToHistory,
  getReceiptHistory,
  getNextReceiptNumber,
} from "./offline-receipt";

export type {
  ReceiptTemplate,
  ReceiptGenerationInput,
  ReceiptHistoryEntry,
} from "./offline-receipt";
