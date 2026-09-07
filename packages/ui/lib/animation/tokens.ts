/**
 * Animation Tokens — huchu App
 *
 * Centralized animation configuration using spring physics.
 * All durations, springs, easings, and stagger patterns are defined here.
 * Import from this file to ensure consistency across the app.
 */

// ---------------------------------------------------------------------------
// Duration Scale
// ---------------------------------------------------------------------------

export const DURATION = {
  /** Micro-interactions: button press, icon change */
  fast: 0.15,
  fastRange: { min: 0.1, max: 0.15 },

  /** Standard transitions: card reveal, layout shift */
  medium: 0.25,
  mediumRange: { min: 0.2, max: 0.3 },

  /** Dramatic moments: page transition, modal open */
  slow: 0.5,
  slowRange: { min: 0.4, max: 0.6 },

  /** Ambient: shimmer, continuous rotation */
  ambient: 1.5,

  /** Exit animations: always snappy */
  exit: 0.2,
} as const;

// ---------------------------------------------------------------------------
// Spring Configuration Library
// ---------------------------------------------------------------------------

export const SPRING = {
  /** Default responsive spring */
  default: { type: "spring" as const, stiffness: 400, damping: 30, mass: 1 },

  /** Snappy spring for buttons */
  button: { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.8 },

  /** Gentle spring for cards */
  card: { type: "spring" as const, stiffness: 400, damping: 25, mass: 1 },

  /** Bouncy spring for badges/notifications */
  bouncy: { type: "spring" as const, stiffness: 600, damping: 20, mass: 0.8 },

  /** Soft spring for layout changes */
  layout: { type: "spring" as const, stiffness: 350, damping: 35, mass: 1.2 },

  /** Tight spring for micro-interactions */
  micro: { type: "spring" as const, stiffness: 800, damping: 35, mass: 0.5 },

  /** Loose spring for dramatic effects */
  dramatic: { type: "spring" as const, stiffness: 200, damping: 20, mass: 1.5 },

  /** Elastic spring for overshoot effects */
  elastic: { type: "spring" as const, stiffness: 500, damping: 15, mass: 1 },

  /** POS-specific springs */
  keypad: { type: "spring" as const, stiffness: 600, damping: 40, mass: 0.6 },
  addToCart: { type: "spring" as const, stiffness: 450, damping: 22, mass: 0.9 },
  cartBounce: { type: "spring" as const, stiffness: 700, damping: 18, mass: 0.7 },

  /** Sync-specific springs */
  syncSpinner: { type: "spring" as const, stiffness: 300, damping: 25, mass: 1 },
  syncSuccess: { type: "spring" as const, stiffness: 600, damping: 20, mass: 0.8 },
  syncFail: { type: "spring" as const, stiffness: 500, damping: 12, mass: 0.9 },

  /** Toast springs */
  toastEnter: { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.5 },
  toastExit: { type: "spring" as const, stiffness: 600, damping: 40, mass: 0.4 },

  /** Panel springs */
  panelOpen: { type: "spring" as const, stiffness: 400, damping: 30, mass: 0.8 },
  panelClose: { type: "spring" as const, stiffness: 500, damping: 40, mass: 0.6 },

  /** Banner springs */
  bannerEnter: { type: "spring" as const, stiffness: 400, damping: 30 },
  bannerExit: { type: "spring" as const, stiffness: 500, damping: 35 },

  /** Badge springs */
  badgeBounce: { type: "spring" as const, stiffness: 600, damping: 20, mass: 0.8 },
  badgeRoll: { type: "spring" as const, stiffness: 500, damping: 30 },
} as const;

// ---------------------------------------------------------------------------
// Easing Library (cubic-bezier for tween-based animations)
// ---------------------------------------------------------------------------

export const EASING = {
  /** Standard Material Design decelerate */
  easeOut: [0.0, 0.0, 0.2, 1] as [number, number, number, number],

  /** Material Design accelerate */
  easeIn: [0.4, 0.0, 1, 1] as [number, number, number, number],

  /** Material Design standard */
  easeInOut: [0.4, 0.0, 0.2, 1] as [number, number, number, number],

  /** Exponential decelerate — for entrances */
  smoothOut: [0.16, 1, 0.3, 1] as [number, number, number, number],

  /** Exponential accelerate — for exits */
  smoothIn: [0.7, 0, 0.84, 0] as [number, number, number, number],

  /** Dramatic — for page transitions */
  smoothInOut: [0.87, 0, 0.13, 1] as [number, number, number, number],

  /** Slight overshoot (spring-like when spring isn't available) */
  springLike: [0.34, 1.56, 0.64, 1] as [number, number, number, number],

  /** Playful bounce */
  bouncy: [0.68, -0.55, 0.265, 1.55] as [number, number, number, number],

  /** Precise, no overshoot — for keypad */
  keypadPress: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],

  /** Classic register "cha-ching" */
  cashRegister: [0.175, 0.885, 0.32, 1.275] as [number, number, number, number],
} as const;

// ---------------------------------------------------------------------------
// Stagger Patterns
// ---------------------------------------------------------------------------

export const STAGGER = {
  /** Fast cascade (lists, grids) */
  fast: 0.03,

  /** Standard cascade (cards, menu items) */
  medium: 0.05,

  /** Dramatic cascade (feature reveals) */
  slow: 0.08,

  /** POS grid items */
  posGrid: 0.04,

  /** Form fields */
  formFields: 0.06,

  /** Scrap material cards */
  materialGrid: 0.05,

  /** Sync panel items */
  syncItems: 0.04,
} as const;

// ---------------------------------------------------------------------------
// Status Color Tokens (CSS variable references)
// ---------------------------------------------------------------------------

export const STATUS_COLORS = {
  online: "var(--status-success-500, #34C759)",
  onlineBg: "rgba(52, 199, 89, 0.1)",
  onlineBorder: "rgba(52, 199, 89, 0.15)",

  offline: "var(--warning-500, #F5A623)",
  offlineBg: "rgba(245, 166, 35, 0.1)",
  offlineBorder: "rgba(245, 166, 35, 0.15)",

  syncing: "var(--info-500, #5AC8FA)",
  syncingBg: "rgba(90, 200, 250, 0.1)",
  syncingBorder: "rgba(90, 200, 250, 0.15)",

  queued: "#BF5AF2",
  queuedBg: "rgba(191, 90, 242, 0.1)",
  queuedBorder: "rgba(191, 90, 242, 0.15)",

  error: "var(--danger-500, #FF453A)",
  errorBg: "rgba(255, 69, 58, 0.1)",
  errorBorder: "rgba(255, 69, 58, 0.15)",

  success: "var(--success-500, #30B0C7)",
  successBg: "rgba(48, 176, 199, 0.1)",

  warning: "var(--warning-500, #FF9F0A)",
  warningBg: "rgba(255, 159, 10, 0.1)",

  info: "var(--info-500, #007AFF)",
  infoBg: "rgba(0, 122, 255, 0.1)",
} as const;
