/**
 * Offline Components — huchu App
 *
 * Premium UI components for the offline-first experience.
 * All components use Framer Motion spring physics and integrate
 * with the OfflineProvider context.
 */

// ---------------------------------------------------------------------------
// Core Offline UI
// ---------------------------------------------------------------------------

export { OfflineStatusIndicator } from "./offline-status-indicator";
export type { OfflineStatusIndicatorProps } from "./offline-status-indicator";

export { SyncPanel } from "./sync-panel";
export type { SyncPanelProps } from "./sync-panel";

export { OfflineBanner } from "./offline-banner";
export type { OfflineBannerProps } from "./offline-banner";

// ---------------------------------------------------------------------------
// Toast & Notifications
// ---------------------------------------------------------------------------

export { SyncToast, useSyncToast } from "./sync-toast";
export type { SyncToastItem, ToastType } from "./sync-toast";

// ---------------------------------------------------------------------------
// Badges & Indicators
// ---------------------------------------------------------------------------

export { QueueBadge } from "./queue-badge";
export type { QueueBadgeProps } from "./queue-badge";

export { StaleDataBadge, StaleDataInline } from "./stale-data-badge";
export type { StaleDataBadgeProps, FreshnessLevel } from "./stale-data-badge";

export { SessionIndicator, SessionStatusPanel } from "./session-indicator";
export type { SessionIndicatorProps, SessionUrgency, SessionStatusPanelProps } from "./session-indicator";

// ---------------------------------------------------------------------------
// Interactive Components
// ---------------------------------------------------------------------------

export { OfflineKeypad, CompactOfflineKeypad } from "./offline-keypad";
export type { OfflineKeypadProps, CompactKeypadProps } from "./offline-keypad";

export { ConflictDialog } from "./conflict-dialog";
export type { ConflictDialogProps, ConflictData, ConflictField } from "./conflict-dialog";

// ---------------------------------------------------------------------------
// Animation Variants (reusable)
// ---------------------------------------------------------------------------

export {
  offlineBannerVariants,
  syncSpinnerVariants,
  syncPulseRingVariants,
  queueBadgeVariants,
  queueNumberVariants,
  toastVariants,
  toastProgressVariants,
  buttonTapVariants,
  cardTapVariants,
  staggerContainerVariants,
  staggerItemVariants,
  syncPanelVariants,
  slideUpPanelVariants,
  statusPillVariants,
  chevronVariants,
  sparkleVariants,
  pulseDotVariants,
  fadeScaleVariants,
  keypadButtonVariants,
} from "./animations";
