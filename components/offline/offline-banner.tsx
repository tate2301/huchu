"use client";

/**
 * Offline Mode Banner — huchu App
 *
 * Slides in from top with spring animation.
 * Shows "Working offline" with amber dot and last sync time.
 * Tap to dismiss. Auto-hides when back online with celebration sparkle.
 * Height: 40px, glassmorphism background.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { WifiOff, Wifi, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOfflineRuntime } from "@/components/providers/offline-provider";
import { SPRING, STATUS_COLORS } from "@/lib/animation/tokens";
import { offlineBannerVariants, sparkleVariants } from "./animations";

// ---------------------------------------------------------------------------
// Sparkle Effect
// ---------------------------------------------------------------------------

function SparkleEffect() {
  const prefersReduced = useReducedMotion();
  if (prefersReduced) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {Array.from({ length: 12 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 bg-white rounded-full"
          style={{
            left: `${10 + (i * 7) % 80}%`,
            top: `${20 + (i * 13) % 60}%`,
          }}
          variants={sparkleVariants}
          initial="initial"
          animate="animate"
          custom={i}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgoShort(dateString: string | null): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 1000 / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface OfflineBannerProps {
  className?: string;
}

export function OfflineBanner({ className = "" }: OfflineBannerProps) {
  const offline = useOfflineRuntime();
  const [dismissed, setDismissed] = useState(false);
  const [showReconnect, setShowReconnect] = useState(false);
  const prefersReduced = useReducedMotion();

  // Track when we transition from offline to online
  useEffect(() => {
    if (!offline.isOffline && dismissed) {
      setDismissed(false);
    }
  }, [offline.isOffline, dismissed]);

  // Show reconnect celebration when coming back online
  useEffect(() => {
    if (!offline.isOffline && showReconnect) {
      const timer = setTimeout(() => setShowReconnect(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [offline.isOffline, showReconnect]);

  // Trigger reconnect celebration
  useEffect(() => {
    if (!offline.isOffline) {
      setShowReconnect(true);
    }
  }, [offline.isOffline]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  const isVisible = offline.isOffline && !dismissed;
  const isReconnectVisible = !offline.isOffline && showReconnect && !dismissed;

  return (
    <div className={cn("relative", className)}>
      <AnimatePresence mode="wait">
        {/* Offline Banner */}
        {isVisible && (
          <motion.div
            key="offline"
            variants={prefersReduced ? {} : offlineBannerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "relative flex items-center gap-3 px-4 h-10 overflow-hidden",
              "bg-[var(--warning-50,#FFF9F0)]/80 backdrop-blur-xl",
              "border-b border-[var(--warning-100)]",
            )}
            style={{
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            }}
          >
            {/* Subtle pulse background */}
            {!prefersReduced && (
              <motion.div
                className="absolute inset-0 bg-[var(--warning-500)]"
                animate={{ opacity: [0, 0.04, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            {/* Amber dot */}
            <span className="relative flex-shrink-0">
              <span
                className="block w-2 h-2 rounded-full"
                style={{ backgroundColor: STATUS_COLORS.offline }}
              />
              {!prefersReduced && (
                <motion.span
                  className="absolute inset-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS.offline }}
                  animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </span>

            {/* Icon */}
            <motion.div
              animate={prefersReduced ? {} : { rotate: [0, -8, 8, -8, 0] }}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 4 }}
            >
              <WifiOff size={16} className="text-[var(--warning-500)] flex-shrink-0" />
            </motion.div>

            {/* Text */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-[13px] font-semibold text-[var(--warning-700)]">
                Working offline
              </span>
              <span className="text-[11px] text-[var(--warning-500)] truncate">
                Last synced {timeAgoShort(offline.lastSyncedAt)}
              </span>
            </div>

            {/* Animated dots */}
            {!prefersReduced && (
              <div className="flex gap-1 mr-2">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1 h-1 rounded-full bg-[var(--warning-500)]"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
            )}

            {/* Dismiss */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={SPRING.micro}
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 rounded-md hover:bg-[var(--warning-100)] text-[var(--warning-700)] transition-colors"
              aria-label="Dismiss"
            >
              <X size={14} />
            </motion.button>
          </motion.div>
        )}

        {/* Reconnect Celebration */}
        {isReconnectVisible && (
          <motion.div
            key="reconnect"
            variants={prefersReduced ? {} : offlineBannerVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "relative flex items-center gap-3 px-4 h-10 overflow-hidden",
              "bg-[var(--success-50)]/80 backdrop-blur-xl",
              "border-b border-[var(--success-100)]",
            )}
            style={{
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
            }}
          >
            <SparkleEffect />

            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={SPRING.bouncy}
            >
              <Wifi size={16} className="text-[var(--success-500)]" />
            </motion.div>

            <motion.p
              className="text-[13px] font-semibold text-[var(--success-700)] relative z-10"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
            >
              Back online! Syncing changes...
            </motion.p>

            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, ...SPRING.bouncy }}
              className="relative z-10 flex items-center gap-1 ml-auto"
            >
              {offline.pendingCount > 0 && (
                <span className="text-[11px] text-[var(--success-700)]">
                  {offline.pendingCount} pending
                </span>
              )}
            </motion.div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={SPRING.micro}
              onClick={handleDismiss}
              className="flex-shrink-0 p-1 rounded-md hover:bg-[var(--success-100)] text-[var(--success-700)] transition-colors relative z-10"
              aria-label="Dismiss"
            >
              <X size={14} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
