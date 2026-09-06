/**
 * Document Lifecycle Service
 *
 * Enforces standard document state transitions across all modules:
 * DRAFT → SUBMITTED → POSTED → CANCELLED
 *
 * Principles:
 * - No deletes after POSTED state
 * - Cancellation creates reversal documents/entries
 * - All transitions logged in audit timeline
 * - State-specific validation rules enforced
 *
 * Used by: Schools (enrollment, invoices, receipts), Auto (deals, payments), Retail (sales, adjustments)
 */

export type DocumentState = "DRAFT" | "SUBMITTED" | "POSTED" | "CANCELLED" | "VOIDED";

export interface DocumentLifecycleContext {
  companyId: string;
  documentType: string;
  documentId: string;
  currentState: DocumentState;
  targetState: DocumentState;
  userId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentTransition {
  from: DocumentState;
  to: DocumentState;
  requiresApproval?: boolean;
  requiresReason?: boolean;
  validation?: (context: DocumentLifecycleContext) => Promise<string | null>;
}

export interface DocumentLifecycleConfig {
  allowedTransitions: DocumentTransition[];
  preventDeleteAfter?: DocumentState[];
  createReversalOn?: DocumentState[];
  auditTimeline?: boolean;
}

/**
 * Standard lifecycle configurations for common document types
 */
export const STANDARD_DOCUMENT_LIFECYCLE: DocumentLifecycleConfig = {
  allowedTransitions: [
    { from: "DRAFT", to: "SUBMITTED" },
    { from: "SUBMITTED", to: "POSTED" },
    { from: "SUBMITTED", to: "DRAFT" }, // Allow editing before posting
    { from: "POSTED", to: "CANCELLED", requiresReason: true },
    { from: "DRAFT", to: "CANCELLED" },
  ],
  preventDeleteAfter: ["POSTED"],
  createReversalOn: ["CANCELLED"],
  auditTimeline: true,
};

export const SIMPLE_DOCUMENT_LIFECYCLE: DocumentLifecycleConfig = {
  allowedTransitions: [
    { from: "DRAFT", to: "POSTED" },
    { from: "POSTED", to: "VOIDED", requiresReason: true },
  ],
  preventDeleteAfter: ["POSTED"],
  createReversalOn: ["VOIDED"],
  auditTimeline: true,
};

/**
 * Validate a state transition
 */
export async function validateTransition(
  context: DocumentLifecycleContext,
  config: DocumentLifecycleConfig
): Promise<{ allowed: boolean; error?: string }> {
  // Find matching transition rule
  const transition = config.allowedTransitions.find(
    (t) => t.from === context.currentState && t.to === context.targetState
  );

  if (!transition) {
    return {
      allowed: false,
      error: `Transition from ${context.currentState} to ${context.targetState} is not allowed`,
    };
  }

  // Check if reason is required
  if (transition.requiresReason && !context.reason) {
    return {
      allowed: false,
      error: `Reason is required for transition from ${context.currentState} to ${context.targetState}`,
    };
  }

  // Run custom validation if provided
  if (transition.validation) {
    const validationError = await transition.validation(context);
    if (validationError) {
      return { allowed: false, error: validationError };
    }
  }

  return { allowed: true };
}

/**
 * Check if document can be deleted
 */
export function canDelete(
  currentState: DocumentState,
  config: DocumentLifecycleConfig
): { allowed: boolean; error?: string } {
  if (config.preventDeleteAfter && config.preventDeleteAfter.includes(currentState)) {
    return {
      allowed: false,
      error: `Cannot delete document in ${currentState} state. Use cancellation instead.`,
    };
  }

  return { allowed: true };
}

/**
 * Check if reversal document should be created
 */
export function shouldCreateReversal(
  targetState: DocumentState,
  config: DocumentLifecycleConfig
): boolean {
  return config.createReversalOn ? config.createReversalOn.includes(targetState) : false;
}

/**
 * Generate audit timeline entry for state transition
 */
export interface AuditTimelineEntry {
  documentType: string;
  documentId: string;
  fromState: DocumentState;
  toState: DocumentState;
  userId: string;
  reason?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export function createAuditEntry(context: DocumentLifecycleContext): AuditTimelineEntry {
  return {
    documentType: context.documentType,
    documentId: context.documentId,
    fromState: context.currentState,
    toState: context.targetState,
    userId: context.userId,
    reason: context.reason,
    timestamp: new Date(),
    metadata: context.metadata,
  };
}

/**
 * State transition helper for common patterns
 */
export class DocumentLifecycle {
  constructor(private config: DocumentLifecycleConfig) {}

  async canTransition(context: DocumentLifecycleContext): Promise<{ allowed: boolean; error?: string }> {
    return validateTransition(context, this.config);
  }

  canDelete(currentState: DocumentState): { allowed: boolean; error?: string } {
    return canDelete(currentState, this.config);
  }

  shouldCreateReversal(targetState: DocumentState): boolean {
    return shouldCreateReversal(targetState, this.config);
  }

  createAuditEntry(context: DocumentLifecycleContext): AuditTimelineEntry {
    return createAuditEntry(context);
  }
}

/**
 * Lifecycle instances for common document types
 */
export const standardLifecycle = new DocumentLifecycle(STANDARD_DOCUMENT_LIFECYCLE);
export const simpleLifecycle = new DocumentLifecycle(SIMPLE_DOCUMENT_LIFECYCLE);

/**
 * Helper to format state for display
 */
export function formatDocumentState(state: DocumentState): string {
  const stateLabels: Record<DocumentState, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    POSTED: "Posted",
    CANCELLED: "Cancelled",
    VOIDED: "Voided",
  };
  return stateLabels[state] || state;
}

/**
 * Helper to get state color for UI
 */
export function getDocumentStateColor(state: DocumentState): string {
  const stateColors: Record<DocumentState, string> = {
    DRAFT: "gray",
    SUBMITTED: "blue",
    POSTED: "green",
    CANCELLED: "red",
    VOIDED: "red",
  };
  return stateColors[state] || "gray";
}
