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

/*
 * `OfflineStatusIndicator` is gone. It was a floating pill pinned bottom-right
 * over every page, and on the POS terminal it covered the keypad's backspace
 * key. Offline state now lives behind `OfflineStatusButton` in the navbar
 * (`components/layout/offline-status-button.tsx`), which opens the full
 * `OfflineRuntimePanel`.
 */

export { SyncPanel } from "./sync-panel";
export type { SyncPanelProps } from "./sync-panel";

export { OfflineBanner } from "./offline-banner";
export type { OfflineBannerProps } from "./offline-banner";

export { OfflineChrome } from "./offline-chrome";

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
