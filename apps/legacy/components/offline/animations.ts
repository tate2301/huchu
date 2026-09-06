/**
 * Shared Offline Animations — huchu App
 *
 * Reusable Framer Motion variant definitions for offline components.
 * All variants use spring physics and are compatible with AnimatePresence.
 */

import { type Variants } from "framer-motion";
import { SPRING, EASING, DURATION } from "@/lib/animation/tokens";

// ---------------------------------------------------------------------------
// Offline Banner
// ---------------------------------------------------------------------------

export const offlineBannerVariants: Variants = {
  hidden: {
    y: -60,
    opacity: 0,
    transition: {
      duration: DURATION.exit,
      ease: EASING.smoothIn,
    },
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: SPRING.bannerEnter,
  },
  exit: {
    y: -60,
    opacity: 0,
    transition: {
      duration: DURATION.exit,
      ease: EASING.smoothIn,
    },
  },
};

// ---------------------------------------------------------------------------
// Sync Spinner (rotating + pulse)
// ---------------------------------------------------------------------------

export const syncSpinnerVariants: Variants = {
  initial: {
    rotate: 0,
    scale: 0.8,
    opacity: 0,
  },
  animate: {
    rotate: 360,
    scale: 1,
    opacity: 1,
    transition: {
      rotate: {
        duration: 1.2,
        repeat: Infinity,
        ease: "linear",
      },
      scale: SPRING.bouncy,
      opacity: { duration: DURATION.fast },
    },
  },
  exit: {
    scale: 0,
    opacity: 0,
    transition: { duration: DURATION.fast },
  },
};

/** Pulse ring that expands and fades */
export const syncPulseRingVariants: Variants = {
  initial: { scale: 0.8, opacity: 0.6 },
  animate: {
    scale: 1.6,
    opacity: 0,
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeOut",
    },
  },
};

// ---------------------------------------------------------------------------
// Queue Badge (bounce + roll)
// ---------------------------------------------------------------------------

export const queueBadgeVariants: Variants = {
  initial: { scale: 0.5, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: SPRING.badgeBounce,
  },
  pulse: {
    scale: [1, 1.2, 0.95, 1.05, 1],
    transition: SPRING.badgeBounce,
  },
  exit: {
    scale: 0.5,
    opacity: 0,
    transition: { duration: DURATION.fast },
  },
};

export const queueNumberVariants: Variants = {
  enter: (direction: number) => ({
    y: direction > 0 ? 20 : -20,
    opacity: 0,
  }),
  center: {
    y: 0,
    opacity: 1,
    transition: SPRING.badgeRoll,
  },
  exit: (direction: number) => ({
    y: direction > 0 ? -20 : 20,
    opacity: 0,
    transition: { duration: DURATION.fast },
  }),
};

// ---------------------------------------------------------------------------
// Toast (slide in/out + shake)
// ---------------------------------------------------------------------------

export const toastVariants: Variants = {
  initial: {
    y: -40,
    opacity: 0,
    scale: 0.96,
  },
  animate: {
    y: 0,
    opacity: 1,
    scale: 1,
    transition: SPRING.toastEnter,
  },
  exit: {
    y: -20,
    opacity: 0,
    scale: 0.96,
    transition: SPRING.toastExit,
  },
  shake: {
    x: [0, -6, 6, -4, 4, -2, 2, 0],
    transition: { duration: 0.5, ease: "easeInOut" },
  },
};

/** Progress bar that shrinks (auto-dismiss timer) */
export const toastProgressVariants: Variants = {
  initial: { scaleX: 1 },
  animate: {
    scaleX: 0,
    transition: {
      duration: 5,
      ease: "linear",
    },
  },
};

// ---------------------------------------------------------------------------
// Button Tap
// ---------------------------------------------------------------------------

export const buttonTapVariants: Variants = {
  initial: { scale: 1 },
  tap: {
    scale: 0.96,
    transition: SPRING.button,
  },
  hover: {
    scale: 1.02,
    transition: SPRING.button,
  },
};

// ---------------------------------------------------------------------------
// Card Tap
// ---------------------------------------------------------------------------

export const cardTapVariants: Variants = {
  initial: {
    scale: 1,
    boxShadow: "0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
  },
  tap: {
    scale: 0.98,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    transition: SPRING.card,
  },
  hover: {
    scale: 1.01,
    y: -2,
    boxShadow: "0 8px 24px rgba(0,0,0,0.10), 0 4px 8px rgba(0,0,0,0.04)",
    transition: SPRING.card,
  },
};

// ---------------------------------------------------------------------------
// Stagger Container + Item
// ---------------------------------------------------------------------------

export const staggerContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.05,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      staggerChildren: 0.02,
      staggerDirection: -1,
    },
  },
};

export const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 500,
      damping: 35,
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: DURATION.exit },
  },
};

// ---------------------------------------------------------------------------
// Sync Panel
// ---------------------------------------------------------------------------

export const syncPanelVariants: Variants = {
  hidden: {
    opacity: 0,
    y: -12,
    scale: 0.96,
    transition: { duration: DURATION.exit, ease: EASING.smoothIn },
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: SPRING.panelOpen,
  },
  exit: {
    opacity: 0,
    y: -8,
    scale: 0.98,
    transition: { duration: DURATION.exit, ease: EASING.smoothIn },
  },
};

// ---------------------------------------------------------------------------
// Slide Up Panel (for mobile bottom sheet)
// ---------------------------------------------------------------------------

export const slideUpPanelVariants: Variants = {
  hidden: {
    y: "100%",
    opacity: 0,
  },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 350,
      damping: 30,
      mass: 0.8,
    },
  },
  exit: {
    y: "100%",
    opacity: 0,
    transition: {
      duration: DURATION.exit,
      ease: EASING.smoothIn,
    },
  },
};

// ---------------------------------------------------------------------------
// Status Pill (the compact indicator)
// ---------------------------------------------------------------------------

export const statusPillVariants: Variants = {
  initial: { scale: 0.9, opacity: 0 },
  animate: {
    scale: 1,
    opacity: 1,
    transition: SPRING.micro,
  },
  exit: {
    scale: 0.9,
    opacity: 0,
    transition: { duration: DURATION.fast },
  },
  tap: {
    scale: 0.96,
    transition: { stiffness: 500, damping: 25 },
  },
};

// ---------------------------------------------------------------------------
// Chevron Rotation
// ---------------------------------------------------------------------------

export const chevronVariants: Variants = {
  closed: { rotate: 0, transition: { duration: 0.2, ease: "easeInOut" } },
  open: { rotate: 180, transition: { duration: 0.2, ease: "easeInOut" } },
};

// ---------------------------------------------------------------------------
// Sparkle / Celebration Particles
// ---------------------------------------------------------------------------

export const sparkleVariants: Variants = {
  initial: { scale: 0, opacity: 1 },
  animate: (i: number) => ({
    scale: [0, 1.5, 0],
    opacity: [1, 0.8, 0],
    y: [0, -20 - Math.random() * 30],
    x: [0, (Math.random() - 0.5) * 40],
    transition: {
      duration: 0.8 + Math.random() * 0.5,
      delay: i * 0.05,
      ease: "easeOut",
    },
  }),
};

// ---------------------------------------------------------------------------
// Pulse Dot (for status indicators)
// ---------------------------------------------------------------------------

export const pulseDotVariants: Variants = {
  initial: { scale: 1, opacity: 0.8 },
  animate: {
    scale: [1, 1.4, 1],
    opacity: [0.8, 0.3, 0.8],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// ---------------------------------------------------------------------------
// Fade Scale (general enter/exit)
// ---------------------------------------------------------------------------

export const fadeScaleVariants: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: SPRING.default,
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: DURATION.exit },
  },
};

// ---------------------------------------------------------------------------
// Keypad Button Press
// ---------------------------------------------------------------------------

export const keypadButtonVariants: Variants = {
  initial: {
    scale: 1,
    y: 0,
    boxShadow: "0 2px 0 var(--keypad-shadow-color, #D1D1D6)",
  },
  tap: {
    scale: 0.93,
    y: 2,
    boxShadow: "0 0px 0 var(--keypad-shadow-color, #D1D1D6)",
    transition: {
      type: "spring",
      stiffness: 500,
      damping: 28,
      mass: 0.5,
    },
  },
};
