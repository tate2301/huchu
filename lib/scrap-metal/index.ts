/**
 * Scrap Metal Module — Export Barrel
 *
 * Re-exports all scrap metal submodules for clean imports:
 *   import { bootstrapScrap, getEntitlements, ... } from "@/lib/scrap-metal";
 */

// ---------------------------------------------------------------------------
// Core scrap metal
// ---------------------------------------------------------------------------

export {
  parseScrapTicketPhotosJson,
  serializeScrapTicketPhotos,
  scrapTicketPhotoSchema,
  scrapTicketPhotoArraySchema,
  SCRAP_TICKET_PHOTO_CONTEXTS,
} from "./attachments";
export type { ScrapTicketPhoto } from "./attachments";

export {
  resolveScrapTicketComplianceRequirements,
} from "./compliance-rules";
export type { ScrapTicketComplianceRequirements } from "./compliance-rules";

export { validateScrapTicketCompliance } from "./compliance-validation";

// ---------------------------------------------------------------------------
// Offline bootstrap (3-phase initialization)
// ---------------------------------------------------------------------------

export {
  bootstrapScrap,
  getScrapBootstrapState,
  isScrapPhase1Complete,
  isScrapOfflineReady,
  resumeScrapBootstrap,
  SCRAP_OFFLINE_MODULE_ID,
} from "./offline-bootstrap";
export type {
  ScrapBootstrapPhase,
  ScrapBootstrapState,
  ScrapBootstrapProgress,
  ScrapBootstrapResult,
  ScrapBootstrapConfig,
} from "./offline-bootstrap";

// ---------------------------------------------------------------------------
// Offline entitlements (#1 critical requirement)
// ---------------------------------------------------------------------------

export {
  cacheEntitlements,
  cacheScrapEntitlements,
  getEntitlements,
  getCachedScrapEntitlements,
  areEntitlementsValid,
  getEntitlementsExpiryStatus,
  canCreatePurchase,
  canCreateSale,
  canApprovePayout,
  canViewReports,
  canCreateSeller,
  canHoldTicket,
  canOverridePrices,
  getMaxPayoutLimit,
  getMaxDailyPayout,
  isPayoutWithinLimit,
  canAccessSite,
  canUseCategory,
} from "./offline-entitlements";
export type {
  OperatorEntitlements,
  EntitlementCheckResult,
} from "./offline-entitlements";

// ---------------------------------------------------------------------------
// Offline materials & pricing
// ---------------------------------------------------------------------------

export {
  cacheMaterials,
  getMaterials,
  getMaterialById,
  searchMaterials,
  getMaterialsByCategory,
  getMaterialCategories,
  getPricing,
  getAllPricing,
  getPricePerKg,
  calculateMaterialValue,
  getPricingStaleness,
  isPricingStale,
  getPricingRefreshIntervalMs,
} from "./offline-materials";
export type {
  ScrapMaterial,
  ScrapMaterialPricing,
  CachedMaterialsBundle,
  PricingStaleness,
} from "./offline-materials";

// ---------------------------------------------------------------------------
// Offline sellers
// ---------------------------------------------------------------------------

export {
  cacheSellers,
  getCachedSellers,
  searchSellers,
  getSellerById,
  createSellerOffline,
  getRecentSellers,
  addRecentSeller,
  isSellerVerified,
  getCachedSellerCount,
  isOfflineSellerId,
} from "./offline-sellers";
export type {
  ScrapSeller,
  CreateSellerInput,
  CachedSellersBundle,
} from "./offline-sellers";

// ---------------------------------------------------------------------------
// Offline tickets (purchase + sales)
// ---------------------------------------------------------------------------

export {
  generateLocalPurchaseTicketNumber,
  generateLocalBatchNumber,
  generateLocalSaleTicketNumber,
  createPurchaseTicketOffline,
  createSaleTicketOffline,
  createSalesBatchOffline,
  addTicketToBatch,
  getPendingTickets,
  getPendingBatches,
  getAllPendingScrapOperations,
  listPendingPurchaseTickets,
  listPendingSaleTickets,
  rehydrateLocalTicketPhotos,
  removePendingTicketCache,
  queueTicketAttachments,
} from "./offline-ticket";
export type {
  ScrapPurchaseTicket,
  ScrapSaleTicket,
  ScrapSalesBatch,
  ScrapSalesBatchItem,
  CreatePurchaseTicketInput,
  CreateSaleTicketInput,
  CreateSalesBatchInput,
  PendingTicketSummary,
  PendingPurchaseTicketRecord,
  PendingSaleTicketRecord,
} from "./offline-ticket";

// ---------------------------------------------------------------------------
// Offline compliance
// ---------------------------------------------------------------------------

export {
  cacheComplianceRules,
  getComplianceRules,
  getComplianceRuleSet,
  getComplianceRuleById,
  areComplianceRulesCached,
  validateTicketAgainstRules,
  validateTicketAgainstRuleSet,
  flagComplianceIssue,
  getSeverityDisplay,
  sortRulesBySeverity,
  adaptServerComplianceRequirements,
} from "./offline-compliance";
export type {
  ScrapComplianceRule,
  ComplianceRuleSeverity,
  ComplianceRuleSet,
  ComplianceValidationResult,
  ComplianceFailure,
  TicketForComplianceCheck,
  ComplianceFlagInput,
} from "./offline-compliance";

// ---------------------------------------------------------------------------
// Offline scale integration
// ---------------------------------------------------------------------------

export {
  cacheWeight,
  getLastWeight,
  getLastWeightValue,
  getLastWeightAgeMs,
  isLastWeightFresh,
  isScaleConnected,
  getCachedScaleDevice,
  cacheScaleDevice,
  markScaleDisconnected,
  markScaleConnected,
  forgetScaleDevice,
  manualWeightEntry,
  validateManualWeight,
  getWeightStaleness,
  readScaleWithFallback,
} from "./offline-scale";
export type {
  ScaleReading,
  ScaleDeviceInfo,
  ManualWeightEntry,
  WeightStaleness,
} from "./offline-scale";

// ---------------------------------------------------------------------------
// Offline runtime (existing — re-exported)
// ---------------------------------------------------------------------------

export {
  SCRAP_OFFLINE_MODULE_ID as SCRAP_MODULE_ID,
  createOfflineScrapSeller,
  listOfflineScrapSellers,
  createOfflineScrapAttachment,
  queueOfflineScrapInboundTicket,
  queueOfflineScrapOutboundTicket,
  listOfflineScrapOperations,
  isOfflineScrapEntityId,
} from "./offline-runtime";
export type {
  LocalScrapTicketPhoto,
  ScrapLocalSellerPayload,
} from "./offline-runtime";

// ---------------------------------------------------------------------------
// Legacy ticket queue (backward compatibility)
// ---------------------------------------------------------------------------

export {
  makeScrapTicketRequestId,
  loadQueuedScrapTicketOperations,
  queueScrapTicketOperation,
  removeQueuedScrapTicketOperation,
  bumpQueuedScrapTicketRetry,
} from "./offline-ticket-queue";
export type {
  ScrapTicketOutboxOperation,
  QueuedScrapTicketOperation,
} from "./offline-ticket-queue";
