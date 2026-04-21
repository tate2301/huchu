/**
 * Offline Compliance Rules
 *
 * Caches compliance rules for client-side validation.
 * Rules are fetched during Phase 2 bootstrap and stored in IndexedDB.
 * Client-side validation works entirely offline.
 */

import { OFFLINE_DB_STORES, getOfflineRecord, putOfflineRecord } from "@/lib/offline/db";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapComplianceRule {
  id: string;
  name: string;
  scope: "INBOUND" | "OUTBOUND" | "BOTH";
  materialId?: string | null;
  category?: string | null;
  requirePhotos: boolean;
  requirePaymentMethod: boolean;
  requirePaymentReference: boolean;
  requireNotes: boolean;
  isActive: boolean;
  severity: ComplianceRuleSeverity;
  /** Free-form condition for complex rules */
  condition?: string | null;
}

export type ComplianceRuleSeverity = "info" | "warning" | "error" | "critical";

export interface ComplianceRuleSet {
  rules: ScrapComplianceRule[];
  fetchedAt: string;
  nextRefreshAt: string;
  version: number;
}

export interface ComplianceValidationResult {
  passes: boolean;
  failures: ComplianceFailure[];
  warnings: ComplianceFailure[];
  ruleCount: number;
  checkedAt: string;
  isOffline: boolean;
}

export interface ComplianceFailure {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: ComplianceRuleSeverity;
}

export interface TicketForComplianceCheck {
  direction: "INBOUND" | "OUTBOUND";
  materialId?: string | null;
  category: string;
  photos: number;
  paymentMethod?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
}

export interface ComplianceFlagInput {
  ruleId: string;
  ticketId: string;
  notes: string;
  severity?: ComplianceRuleSeverity;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPLIANCE_RULES_CACHE_KEY = "scrap:compliance:rules";
const COMPLIANCE_FLAGS_QUEUE_KEY = "scrap:compliance:flags:queue";
const COMPLIANCE_CACHE_VERSION = 1;
const COMPLIANCE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ---------------------------------------------------------------------------
// Rule caching
// ---------------------------------------------------------------------------

/**
 * Bulk cache compliance rules.
 * Called during Phase 2 bootstrap.
 */
export async function cacheComplianceRules(
  rules: ScrapComplianceRule[],
): Promise<void> {
  const ruleSet: ComplianceRuleSet = {
    rules,
    fetchedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + COMPLIANCE_CACHE_TTL_MS).toISOString(),
    version: COMPLIANCE_CACHE_VERSION,
  };

  await putOfflineRecord(OFFLINE_DB_STORES.queryCache, {
    id: COMPLIANCE_RULES_CACHE_KEY,
    tenantKey: "",
    queryKey: ["scrap-compliance-rules"],
    data: ruleSet,
    updatedAt: Date.now(),
    maxAgeMs: COMPLIANCE_CACHE_TTL_MS,
    moduleId: "scrap-metal",
  });
}

/**
 * Get cached compliance rules.
 * Returns empty array if no rules are cached.
 */
export async function getComplianceRules(): Promise<ScrapComplianceRule[]> {
  const record = await getOfflineRecord<{
    data: ComplianceRuleSet;
  }>(OFFLINE_DB_STORES.queryCache, COMPLIANCE_RULES_CACHE_KEY);

  return record?.data?.rules ?? [];
}

/**
 * Get the full compliance rule set with metadata.
 */
export async function getComplianceRuleSet(): Promise<ComplianceRuleSet | null> {
  const record = await getOfflineRecord<{
    data: ComplianceRuleSet;
  }>(OFFLINE_DB_STORES.queryCache, COMPLIANCE_RULES_CACHE_KEY);

  return record?.data ?? null;
}

/**
 * Get a single compliance rule by ID.
 */
export async function getComplianceRuleById(id: string): Promise<ScrapComplianceRule | null> {
  const rules = await getComplianceRules();
  return rules.find((r) => r.id === id) ?? null;
}

/**
 * Check if compliance rules are cached and not expired.
 */
export async function areComplianceRulesCached(): Promise<boolean> {
  const record = await getOfflineRecord<{
    data: ComplianceRuleSet;
    updatedAt: number;
    maxAgeMs: number;
  }>(OFFLINE_DB_STORES.queryCache, COMPLIANCE_RULES_CACHE_KEY);

  if (!record?.data) return false;
  const ageMs = Date.now() - record.updatedAt;
  return ageMs < record.maxAgeMs;
}

// ---------------------------------------------------------------------------
// Client-side validation (works offline)
// ---------------------------------------------------------------------------

/**
 * Validate a ticket against cached compliance rules.
 * Works entirely offline — this is the key compliance function.
 */
export async function validateTicketAgainstRules(
  ticket: TicketForComplianceCheck,
): Promise<ComplianceValidationResult> {
  const rules = await getComplianceRules();
  return validateTicketAgainstRuleSet(ticket, rules);
}

/**
 * Synchronous validation against a given rule set.
 * Use this when you already have the rules loaded.
 */
export function validateTicketAgainstRuleSet(
  ticket: TicketForComplianceCheck,
  rules: ScrapComplianceRule[],
): ComplianceValidationResult {
  // Filter applicable rules
  const applicableRules = rules.filter((rule) => {
    if (!rule.isActive) return false;
    if (rule.scope !== "BOTH" && rule.scope !== ticket.direction) return false;
    if (rule.materialId && rule.materialId !== (ticket.materialId ?? null)) return false;
    if (rule.category && rule.category !== ticket.category) return false;
    return true;
  });

  const failures: ComplianceFailure[] = [];
  const warnings: ComplianceFailure[] = [];

  for (const rule of applicableRules) {
    // Check photos requirement
    if (rule.requirePhotos && ticket.photos === 0) {
      const failure = {
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule "${rule.name}": At least one photo is required`,
        severity: rule.severity,
      };
      if (rule.severity === "error" || rule.severity === "critical") {
        failures.push(failure);
      } else {
        warnings.push(failure);
      }
    }

    // Check payment method requirement
    if (rule.requirePaymentMethod && !ticket.paymentMethod?.trim()) {
      const failure = {
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule "${rule.name}": Payment method is required`,
        severity: rule.severity,
      };
      if (rule.severity === "error" || rule.severity === "critical") {
        failures.push(failure);
      } else {
        warnings.push(failure);
      }
    }

    // Check payment reference requirement
    if (rule.requirePaymentReference && !ticket.paymentReference?.trim()) {
      const failure = {
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule "${rule.name}": Payment reference is required`,
        severity: rule.severity,
      };
      if (rule.severity === "error" || rule.severity === "critical") {
        failures.push(failure);
      } else {
        warnings.push(failure);
      }
    }

    // Check notes requirement
    if (rule.requireNotes && (!ticket.notes || ticket.notes.trim().length < 3)) {
      const failure = {
        ruleId: rule.id,
        ruleName: rule.name,
        message: `Rule "${rule.name}": Notes are required (min 3 characters)`,
        severity: rule.severity,
      };
      if (rule.severity === "error" || rule.severity === "critical") {
        failures.push(failure);
      } else {
        warnings.push(failure);
      }
    }
  }

  return {
    passes: failures.length === 0,
    failures,
    warnings,
    ruleCount: applicableRules.length,
    checkedAt: new Date().toISOString(),
    isOffline: true,
  };
}

// ---------------------------------------------------------------------------
// Compliance flagging (offline queue)
// ---------------------------------------------------------------------------

/**
 * Flag a compliance issue for a ticket.
 * Queues the flag for sync when back online.
 */
export async function flagComplianceIssue(
  tenantKey: string,
  input: ComplianceFlagInput,
): Promise<{ queued: boolean; operationId?: string }> {
  const { enqueueOfflineOperation } = await import("@/lib/offline/outbox");
  const clientRequestId = `scrap-compliance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const operation = await enqueueOfflineOperation({
    tenantKey,
    moduleId: "scrap-metal",
    clientRequestId,
    entityType: "scrap-compliance-flag",
    operation: "flag-compliance-issue",
    dependsOn: [],
    payload: {
      ruleId: input.ruleId,
      ticketId: input.ticketId,
      notes: input.notes,
      severity: input.severity ?? "warning",
      flaggedAt: new Date().toISOString(),
    },
    syncPriority: 25, // Lower priority than tickets
  });

  return { queued: true, operationId: operation.operationId };
}

// ---------------------------------------------------------------------------
// Rule severity classification
// ---------------------------------------------------------------------------

/**
 * Get the severity color/level for a rule severity.
 */
export function getSeverityDisplay(severity: ComplianceRuleSeverity): {
  label: string;
  color: string;
  icon: string;
} {
  switch (severity) {
    case "info":
      return { label: "Info", color: "text-blue-500", icon: "ℹ" };
    case "warning":
      return { label: "Warning", color: "text-yellow-500", icon: "⚠" };
    case "error":
      return { label: "Error", color: "text-orange-500", icon: "🔶" };
    case "critical":
      return { label: "Critical", color: "text-red-500", icon: "🚫" };
    default:
      return { label: "Unknown", color: "text-gray-500", icon: "?" };
  }
}

/**
 * Sort rules by severity (critical first).
 */
export function sortRulesBySeverity(rules: ScrapComplianceRule[]): ScrapComplianceRule[] {
  const severityOrder: Record<ComplianceRuleSeverity, number> = {
    critical: 0,
    error: 1,
    warning: 2,
    info: 3,
  };
  return [...rules].sort(
    (a, b) => severityOrder[a.severity] - severityOrder[b.severity],
  );
}

// ---------------------------------------------------------------------------
// Compatibility with server-side compliance types
// ---------------------------------------------------------------------------

/**
 * Convert server-side compliance requirements to our offline format.
 */
export function adaptServerComplianceRequirements(
  requirements: {
    requirePhotos: boolean;
    requirePaymentMethod: boolean;
    requirePaymentReference: boolean;
    requireNotes: boolean;
    matchedRuleIds: string[];
  },
  ruleName = "Server rule",
): ScrapComplianceRule {
  return {
    id: requirements.matchedRuleIds[0] ?? "server-rule",
    name: ruleName,
    scope: "BOTH",
    requirePhotos: requirements.requirePhotos,
    requirePaymentMethod: requirements.requirePaymentMethod,
    requirePaymentReference: requirements.requirePaymentReference,
    requireNotes: requirements.requireNotes,
    isActive: true,
    severity: "error",
  };
}
