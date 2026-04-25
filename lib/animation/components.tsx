"use client";

/**
 * Reusable Animation Components — huchu App
 *
 * Premium animated primitives built on Framer Motion.
 * All components use spring physics and respect prefers-reduced-motion.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, AnimatePresence, type HTMLMotionProps, type PanInfo, useMotionValue, useTransform, animate } from "framer-motion";
import { Check } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SPRING, DURATION, STAGGER } from "./tokens";

// ---------------------------------------------------------------------------
// AnimatedButton — button with spring press + ripple
// ---------------------------------------------------------------------------

interface AnimatedButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger" | "danger-ghost";
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  loading?: boolean;
  success?: boolean;
}

export function AnimatedButton({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  success = false,
  className = "",
  disabled,
  onClick,
  ...props
}: AnimatedButtonProps) {
  const prefersReduced = useReducedMotion();
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setRipple({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setTimeout(() => setRipple(null), 600);
      onClick?.(e);
    },
    [onClick],
  );

  const variantClasses = {
    primary: "bg-[var(--action-primary-bg)] text-[var(--action-primary-fg)] shadow-[var(--shadow-colored,0_4px_12px_rgba(0,122,255,0.20))]",
    secondary: "bg-[var(--interactive-secondary,#E9E9EB)] text-[var(--text-primary,#1A1A1E)] shadow-[var(--shadow-sm)]",
    ghost: "bg-transparent text-[var(--interactive-primary,#007AFF)]",
    outline: "bg-transparent border-[1.5px] border-[var(--interactive-primary,#007AFF)] text-[var(--interactive-primary,#007AFF)]",
    danger: "bg-[var(--interactive-danger,#FF453A)] text-white shadow-[0_4px_12px_rgba(255,69,58,0.20)]",
    "danger-ghost": "bg-transparent text-[var(--interactive-danger,#FF453A)]",
  };

  const sizeClasses = {
    xs: "h-7 px-2.5 text-xs rounded-md gap-1",
    sm: "h-8 px-3 text-[13px] gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-12 px-5 text-[15px] gap-2 rounded-xl",
    xl: "h-14 px-6 text-base gap-2 rounded-[14px]",
  };

  return (
    <motion.button
      whileHover={prefersReduced ? {} : { scale: disabled || loading ? 1 : 1.02 }}
      whileTap={prefersReduced ? {} : { scale: disabled || loading ? 1 : 0.96 }}
      transition={SPRING.button}
      className={cn(
        "relative inline-flex items-center justify-center whitespace-nowrap font-semibold tracking-[0.01em] overflow-hidden outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30 focus-visible:ring-offset-0",
        "disabled:opacity-40 disabled:pointer-events-none disabled:grayscale-[0.3]",
        variantClasses[variant],
        sizeClasses[size],
        loading && "opacity-80 pointer-events-none",
        className,
      )}
      disabled={disabled || loading}
      onClick={handleClick}
      {...props}
    >
      {/* Ripple effect */}
      <AnimatePresence>
        {ripple && !prefersReduced && (
          <motion.span
            className="absolute rounded-full bg-white/20 pointer-events-none"
            style={{
              left: ripple.x,
              top: ripple.y,
              width: 10,
              height: 10,
              marginLeft: -5,
              marginTop: -5,
            }}
            initial={{ scale: 0, opacity: 0.5 }}
            animate={{ scale: 30, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        )}
      </AnimatePresence>

      {/* Loading spinner */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={SPRING.micro}
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.div
              className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
            />
          </motion.div>
        ) : success ? (
          <motion.div
            key="success"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={SPRING.syncSuccess}
            className="absolute inset-0 flex items-center justify-center"
          >
            <motion.span
              initial={{ scale: 0.75, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            >
              <Check className="h-5 w-5" weight="bold" />
            </motion.span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Content */}
      <span className={cn("relative z-10", loading && "opacity-0")}>{children}</span>
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// AnimatedCard — card with press feedback
// ---------------------------------------------------------------------------

interface AnimatedCardProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  pressScale?: number;
  hoverLift?: number;
}

export function AnimatedCard({
  children,
  pressScale = 0.98,
  hoverLift = -2,
  className = "",
  ...props
}: AnimatedCardProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.div
      whileHover={
        prefersReduced
          ? {}
          : {
              scale: 1.01,
              y: hoverLift,
              boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
            }
      }
      whileTap={prefersReduced ? {} : { scale: pressScale, boxShadow: "0 2px 8px rgba(0,0,0,0.06)", y: 0 }}
      transition={SPRING.card}
      className={cn(
        "bg-[var(--bg-elevated,#FFFFFF)] rounded-[var(--card-radius,12px)] shadow-[var(--shadow-sm)] border border-[var(--border-subtle,#F0F0F2)] cursor-pointer isolate",
        className,
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// SwipeableItem — swipeable list item with snap
// ---------------------------------------------------------------------------

interface SwipeAction {
  label: string;
  icon: React.ReactNode;
  color: string;
  onAction: () => void;
}

interface SwipeableItemProps {
  children: React.ReactNode;
  actions: SwipeAction[];
  threshold?: number;
  className?: string;
}

export function SwipeableItem({ children, actions, threshold = 100, className = "" }: SwipeableItemProps) {
  const x = useMotionValue(0);
  const [isOpen, setIsOpen] = useState(false);
  const prefersReduced = useReducedMotion();

  const actionOpacity = useTransform(x, [0, -threshold / 2], [0, 1]);

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      const offset = info.offset.x;
      const velocity = info.velocity.x;

      if (offset < -threshold / 2 || velocity < -500) {
        animate(x, -threshold * Math.min(actions.length, 2), {
          type: "spring",
          stiffness: 500,
          damping: 30,
        });
        setIsOpen(true);
      } else {
        animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
        setIsOpen(false);
      }
    },
    [x, threshold, actions.length],
  );

  const handleAction = useCallback(
    (action: SwipeAction) => {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 30 });
      setIsOpen(false);
      action.onAction();
    },
    [x],
  );

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)}>
      {/* Action layer (behind content) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end gap-1 p-2"
        style={{ opacity: actionOpacity }}
      >
        {actions.map((action, index) => (
          <motion.button
            key={index}
            onClick={() => handleAction(action)}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={isOpen ? { scale: 1, opacity: 1 } : { scale: 0.8, opacity: 0 }}
            transition={{
              delay: index * 0.05,
              ...SPRING.bouncy,
            }}
            className={cn(
              "text-white px-4 py-3 rounded-xl flex flex-col items-center gap-1 min-w-[72px]",
              action.color,
            )}
          >
            {action.icon}
            <span className="text-xs font-medium">{action.label}</span>
          </motion.button>
        ))}
      </motion.div>

      {/* Content layer (swipeable) */}
      <motion.div
        style={{ x }}
        drag="x"
        dragConstraints={{ left: isOpen ? -threshold * actions.length : 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
        className="relative z-10 touch-pan-y"
      >
        {children}
      </motion.div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StaggerReveal — staggered children animation
// ---------------------------------------------------------------------------

interface StaggerRevealProps {
  children: React.ReactNode;
  staggerDelay?: number;
  direction?: "up" | "down" | "left" | "right";
  distance?: number;
  className?: string;
  delayChildren?: number;
}

const getDirectionOffset = (direction: string, distance: number) => {
  switch (direction) {
    case "up":
      return { y: distance };
    case "down":
      return { y: -distance };
    case "left":
      return { x: distance };
    case "right":
      return { x: -distance };
    default:
      return { y: distance };
  }
};

export function StaggerReveal({
  children,
  staggerDelay = STAGGER.medium,
  direction = "up",
  distance = 16,
  className = "",
  delayChildren = 0.05,
}: StaggerRevealProps) {
  const prefersReduced = useReducedMotion();
  void getDirectionOffset(direction, distance);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren,
      },
    },
  };

  if (prefersReduced) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}

/** Wrapper for individual stagger items */
interface StaggerItemProps {
  children: React.ReactNode;
  className?: string;
}

export function StaggerItem({ children, className = "" }: StaggerItemProps) {
  const offset = { y: 16 };
  const itemVariants = {
    hidden: { opacity: 0, ...offset },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: SPRING.default,
    },
  };

  return (
    <motion.div variants={itemVariants} className={className}>
      {children}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AnimatedNumber — counting number animation
// ---------------------------------------------------------------------------

interface AnimatedNumberProps {
  value: number;
  formatter?: (value: number) => string;
  duration?: number;
  className?: string;
}

export function AnimatedNumber({
  value,
  formatter = (v) => v.toLocaleString(),
  duration = DURATION.slow,
  className = "",
}: AnimatedNumberProps) {
  const prefersReduced = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(value);
  const prevValueRef = useRef(value);

  useEffect(() => {
    if (prefersReduced) {
      setDisplayValue(value);
      prevValueRef.current = value;
      return;
    }

    const from = prevValueRef.current;
    const to = value;
    const diff = to - from;
    if (diff === 0) return;

    let startTime: number | null = null;
    let animationFrame: number;

    const step = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / (duration * 1000), 1);

      // easeOutCubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + diff * eased;

      setDisplayValue(Math.round(current * 100) / 100);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(step);
      } else {
        prevValueRef.current = to;
      }
    };

    animationFrame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrame);
  }, [value, duration, prefersReduced]);

  return (
    <motion.span
      key={value}
      initial={prefersReduced ? {} : { scale: 1.1, opacity: 0.7 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING.micro}
      className={cn("tabular-nums inline-block", className)}
    >
      {formatter(displayValue)}
    </motion.span>
  );
}

// ---------------------------------------------------------------------------
// ShimmerSkeleton — shimmer loading skeleton
// ---------------------------------------------------------------------------

interface ShimmerSkeletonProps {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "card";
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function ShimmerSkeleton({
  className = "",
  variant = "text",
  width,
  height,
  lines = 1,
}: ShimmerSkeletonProps) {
  const prefersReduced = useReducedMotion();

  const variantClasses = {
    text: "h-4 w-full",
    circular: "rounded-full",
    rectangular: "",
    card: "h-32 w-full rounded-xl",
  };

  const SkeletonLine = ({ delay = 0, isLast }: { delay: number; isLast: boolean }) => (
    <div
      className={cn(
        "relative overflow-hidden bg-[var(--surface-soft,var(--neutral-100,#f2f4f4))]",
        variantClasses[variant],
        !isLast && "mb-2",
        className,
      )}
      style={{
        width: variant === "circular" ? height ?? width : width,
        height,
        borderRadius: variant === "circular" ? "9999px" : undefined,
      }}
    >
      {!prefersReduced && (
        <motion.div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(
              90deg,
              transparent 0%,
              rgba(255,255,255,0.5) 50%,
              transparent 100%
            )`,
          }}
          animate={{ x: ["-200%", "200%"] }}
          transition={{
            duration: DURATION.ambient,
            ease: "easeInOut",
            repeat: Infinity,
            delay,
          }}
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col w-full">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} delay={i * 0.15} isLast={i === lines - 1} />
      ))}
    </div>
  );
}

/** Preset skeleton layouts */
export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={cn("bg-[var(--surface-base)] rounded-xl p-4 border border-[var(--border-subtle)] space-y-3", className)}>
      <div className="flex items-center gap-3">
        <ShimmerSkeleton variant="circular" width={48} height={48} />
        <div className="flex-1 space-y-2">
          <ShimmerSkeleton variant="text" width="60%" />
          <ShimmerSkeleton variant="text" width="40%" />
        </div>
      </div>
      <ShimmerSkeleton variant="text" width="90%" />
      <ShimmerSkeleton variant="text" width="75%" />
    </div>
  );
}

export function SkeletonList({ count = 5, className = "" }: { count?: number; className?: string }) {
  return (
    <motion.div
      className={cn("space-y-3", className)}
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: STAGGER.medium },
        },
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          variants={{
            hidden: { opacity: 0, y: 10 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={SPRING.default}
        >
          <SkeletonCard />
        </motion.div>
      ))}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// AnimatedToggle — toggle switch with spring animation
// ---------------------------------------------------------------------------

interface AnimatedToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function AnimatedToggle({ checked, onChange, disabled = false, className = "" }: AnimatedToggleProps) {
  const prefersReduced = useReducedMotion();

  return (
    <motion.button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={cn(
        "relative w-14 h-8 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
        checked ? "bg-[var(--interactive-primary,#007AFF)]" : "bg-[var(--neutral-300,#D1D1D6)]",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "cursor-pointer",
        className,
      )}
      animate={prefersReduced ? {} : { backgroundColor: checked ? "var(--interactive-primary,#007AFF)" : "var(--neutral-300,#D1D1D6)" }}
      transition={{ duration: 0.2 }}
    >
      {/* Track glow when on */}
      {checked && !prefersReduced && (
        <motion.div
          className="absolute inset-0 rounded-full bg-[var(--interactive-primary,#007AFF)]/30"
          initial={{ scale: 1, opacity: 0 }}
          animate={{ scale: 1.3, opacity: [0, 0.5, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, repeatDelay: 2 }}
        />
      )}

      {/* Knob */}
      <motion.div
        className="absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md"
        animate={{ x: checked ? 24 : 0 }}
        transition={prefersReduced ? { duration: 0 } : SPRING.bouncy}
      >
        {/* Check mark inside knob */}
        <motion.span
          className="absolute inset-0 flex items-center justify-center p-1.5"
          initial={false}
          animate={{ opacity: checked ? 1 : 0, scale: checked ? 1 : 0.5 }}
          transition={{ duration: 0.15 }}
        >
          <Check className="h-full w-full text-[var(--interactive-primary,#007AFF)]" weight="bold" />
        </motion.span>
      </motion.div>
    </motion.button>
  );
}
