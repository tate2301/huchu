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
