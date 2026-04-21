"use client";

/**
 * Queue Count Badge — huchu App
 *
 * Animated badge showing pending operation count.
 * Number "rolls" up like slot machine when count changes.
 * Pulse animation when new item added.
 * Spring bounce on change.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING, STATUS_COLORS } from "@/lib/animation/tokens";
import { queueBadgeVariants, queueNumberVariants } from "./animations";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface QueueBadgeProps {
  count: number;
  className?: string;
  showIcon?: boolean;
  size?: "sm" | "md" | "lg";
}

export function QueueBadge({
  count,
  className = "",
  showIcon = true,
  size = "md",
}: QueueBadgeProps) {
  const [displayCount, setDisplayCount] = useState(count);
  const [isPulsing, setIsPulsing] = useState(false);
  const [direction, setDirection] = useState(1);
  const prevCount = useRef(count);
  const prefersReduced = useReducedMotion();

  useEffect(() => {
    if (count !== prevCount.current) {
      setIsPulsing(true);
      setDirection(count > prevCount.current ? 1 : -1);

      // Small delay for the number roll effect
      const timer = setTimeout(() => {
        setDisplayCount(count);
        prevCount.current = count;
      }, 50);

      const pulseTimer = setTimeout(() => setIsPulsing(false), 600);

      return () => {
        clearTimeout(timer);
        clearTimeout(pulseTimer);
      };
    }
  }, [count]);

  const sizeClasses = {
    sm: "h-5 min-w-[20px] px-1 text-[10px] gap-0.5",
    md: "h-6 min-w-[24px] px-1.5 text-[11px] gap-1",
    lg: "h-7 min-w-[28px] px-2 text-xs gap-1",
  };

  const iconSizes = {
    sm: 10,
    md: 12,
    lg: 14,
  };

  return (
    <motion.div
      variants={queueBadgeVariants}
      initial="initial"
      animate={isPulsing && !prefersReduced ? "pulse" : "animate"}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full font-bold",
        "bg-[var(--status-queued-bg,rgba(191,90,242,0.1))]",
        "text-[var(--status-queued,#BF5AF2)]",
        sizeClasses[size],
        className,
      )}
    >
      {/* Pulse ring on count change */}
      {isPulsing && !prefersReduced && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: STATUS_COLORS.queued }}
          initial={{ scale: 1, opacity: 0.4 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 0.5 }}
        />
      )}

      {/* Icon */}
      {showIcon && (
        <Layers
          size={iconSizes[size]}
          className="flex-shrink-0 relative z-10"
        />
      )}

      {/* Number with slot-machine roll effect */}
      <div className="relative overflow-hidden h-[1.2em] z-10">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.span
            key={displayCount}
            className="block font-bold tabular-nums leading-[1.2em]"
            custom={direction}
            variants={prefersReduced ? {} : queueNumberVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            {displayCount}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* Subtle bounce shadow */}
      {!prefersReduced && (
        <motion.div
          className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full blur-sm"
          style={{ backgroundColor: STATUS_COLORS.queued }}
          animate={{
            scale: isPulsing ? [1, 1.3, 1] : 1,
            opacity: isPulsing ? [0.2, 0.1, 0.2] : 0.15,
          }}
          transition={{ duration: 0.4 }}
        />
      )}
    </motion.div>
  );
}
