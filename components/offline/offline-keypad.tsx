"use client";

/**
 * Premium POS Keypad — huchu App
 *
 * 72px touch targets (56px min on small screens).
 * Number grid: 1-9, ., 0, C.
 * Spring animation on press: scale 0.92 -> 1.
 * Subtle shadow depth change on press.
 * Enter button with accent color.
 * Clear button with rose color.
 * Hold-to-clear functionality.
 */

import { useCallback, useRef, useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Delete, CornerDownLeft } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { SPRING } from "@/lib/animation/tokens";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KeyConfig {
  label: React.ReactNode;
  value: string;
  type: "number" | "decimal" | "clear" | "enter";
  ariaLabel: string;
}

export interface OfflineKeypadProps {
  onKeyPress: (value: string) => void;
  onEnter?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  enterLabel?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Key Component
// ---------------------------------------------------------------------------

function KeypadKey({
  config,
  onPress,
  disabled = false,
  prefersReduced,
}: {
  config: KeyConfig;
  onPress: () => void;
  disabled?: boolean;
  prefersReduced: boolean | null;
}) {
  const [isPressed, setIsPressed] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const isEnter = config.type === "enter";
  const isClear = config.type === "clear";
  const isDecimal = config.type === "decimal";

  const baseClasses = cn(
    "relative flex items-center justify-center rounded-xl font-semibold select-none",
    "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
    "transition-colors duration-100",
    "active:shadow-none",
    disabled && "opacity-40 pointer-events-none",
  );

  const typeClasses = {
    number: cn(
      "bg-[var(--keypad-bg,var(--neutral-100,#F2F2F7))] text-[var(--keypad-text,var(--text-primary))]",
      "shadow-[0_2px_0_var(--keypad-shadow,#D1D1D6)]",
      "active:bg-[var(--keypad-active,#D1D1D6)]",
      "text-[22px]",
    ),
    decimal: cn(
      "bg-[#E9F5FF] text-[var(--interactive-primary,#007AFF)]",
      "shadow-[0_2px_0_#B8D9FF]",
      "active:bg-[#D0EBFF]",
      "text-lg",
    ),
    clear: cn(
      "bg-[#FFE5E3] text-[var(--keypad-clear,#FF453A)]",
      "shadow-[0_2px_0_#FFB3AD]",
      "active:bg-[#FFD1CD]",
      "text-lg",
    ),
    enter: cn(
      "bg-[var(--keypad-enter,var(--interactive-primary,#007AFF))] text-white",
      "shadow-[0_4px_0_var(--keypad-enter-active,#0051A8)]",
      "active:bg-[var(--keypad-enter-active,#0066CC)]",
      "text-[15px] font-bold",
    ),
  };

  const handlePointerDown = useCallback(() => {
    setIsPressed(true);
    isLongPress.current = false;

    if (isClear) {
      longPressTimer.current = setTimeout(() => {
        isLongPress.current = true;
        onPress(); // Long press triggers full clear
      }, 500);
    }
  }, [isClear, onPress]);

  const handlePointerUp = useCallback(() => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!isLongPress.current) {
      onPress();
    }
  }, [onPress]);

  const handlePointerLeave = useCallback(() => {
    setIsPressed(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // Haptic feedback
  const triggerHaptic = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(10);
      } catch {
        // Ignore haptic errors
      }
    }
  }, []);

  return (
    <motion.button
      className={cn(baseClasses, typeClasses[config.type])}
      role="button"
      aria-label={config.ariaLabel}
      whileTap={
        prefersReduced
          ? {}
          : {
              scale: isEnter ? 0.97 : 0.93,
              y: isEnter ? 3 : 2,
              boxShadow: isEnter
                ? "0 0px 0 var(--keypad-enter-active,#0051A8)"
                : isClear
                  ? "0 0px 0 #FFB3AD"
                  : isDecimal
                    ? "0 0px 0 #B8D9FF"
                    : "0 0px 0 var(--keypad-shadow,#D1D1D6)",
            }
      }
      transition={{
        type: "spring",
        stiffness: 500,
        damping: 28,
        mass: 0.5,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={triggerHaptic}
      disabled={disabled}
      style={{
        touchAction: "manipulation",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {config.label}
    </motion.button>
  );
}

// ---------------------------------------------------------------------------
// Main Keypad Component
// ---------------------------------------------------------------------------

export function OfflineKeypad({
  onKeyPress,
  onEnter,
  onClear,
  disabled = false,
  enterLabel = "Enter",
  className = "",
}: OfflineKeypadProps) {
  const prefersReduced = useReducedMotion();

  const handleKeyPress = useCallback(
    (value: string, type: string) => {
      if (disabled) return;

      if (type === "enter") {
        onEnter?.();
      } else if (type === "clear") {
        onClear?.();
      } else {
        onKeyPress(value);
      }
    },
    [disabled, onKeyPress, onEnter, onClear],
  );

  const keys: KeyConfig[] = [
    { label: "1", value: "1", type: "number", ariaLabel: "Number 1" },
    { label: "2", value: "2", type: "number", ariaLabel: "Number 2" },
    { label: "3", value: "3", type: "number", ariaLabel: "Number 3" },
    { label: "4", value: "4", type: "number", ariaLabel: "Number 4" },
    { label: "5", value: "5", type: "number", ariaLabel: "Number 5" },
    { label: "6", value: "6", type: "number", ariaLabel: "Number 6" },
    { label: "7", value: "7", type: "number", ariaLabel: "Number 7" },
    { label: "8", value: "8", type: "number", ariaLabel: "Number 8" },
    { label: "9", value: "9", type: "number", ariaLabel: "Number 9" },
    {
      label: ".00",
      value: ".",
      type: "decimal",
      ariaLabel: "Decimal point",
    },
    { label: "0", value: "0", type: "number", ariaLabel: "Number 0" },
    {
      label: <Delete size={22} />,
      value: "backspace",
      type: "clear",
      ariaLabel: "Backspace, long press to clear all",
    },
  ];

  return (
    <div className={cn("w-full select-none", className)}>
      {/* Number grid */}
      <div className="grid grid-cols-3 gap-2">
        {keys.map((key) => (
          <KeypadKey
            key={key.ariaLabel}
            config={key}
            onPress={() => handleKeyPress(key.value, key.type)}
            disabled={disabled}
            prefersReduced={prefersReduced}
          />
        ))}
      </div>

      {/* Enter button */}
      <motion.button
        className={cn(
          "w-full mt-2 h-14 rounded-xl font-bold text-[15px]",
          "bg-[var(--keypad-enter,var(--interactive-primary,#007AFF))] text-white",
          "shadow-[0_4px_0_var(--keypad-enter-active,#0051A8)]",
          "active:bg-[var(--keypad-enter-active,#0066CC)] active:shadow-none",
          "flex items-center justify-center gap-2",
          "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
          disabled && "opacity-40 pointer-events-none",
        )}
        role="button"
        aria-label="Submit transaction"
        whileTap={
          prefersReduced
            ? {}
            : {
                scale: 0.97,
                y: 3,
                boxShadow: "0 0px 0 var(--keypad-enter-active,#0051A8)",
              }
        }
        transition={{
          type: "spring",
          stiffness: 500,
          damping: 28,
          mass: 0.5,
        }}
        onClick={() => handleKeyPress("enter", "enter")}
        disabled={disabled}
        style={{
          touchAction: "manipulation",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <CornerDownLeft size={18} />
        {enterLabel}
      </motion.button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Compact Keypad (4-column layout with side actions)
// ---------------------------------------------------------------------------

export interface CompactKeypadProps extends OfflineKeypadProps {
  onQuickAdd?: (amount: number) => void;
  quickAddValues?: number[];
}

export function CompactOfflineKeypad({
  onKeyPress,
  onEnter,
  onClear,
  onQuickAdd,
  quickAddValues = [10, 50, 100],
  disabled = false,
  enterLabel = "Enter",
  className = "",
}: CompactKeypadProps) {
  const prefersReduced = useReducedMotion();

  const handleKeyPress = useCallback(
    (value: string, type: string) => {
      if (disabled) return;

      if (type === "enter") {
        onEnter?.();
      } else if (type === "clear") {
        onClear?.();
      } else {
        onKeyPress(value);
      }
    },
    [disabled, onKeyPress, onEnter, onClear],
  );

  const gridKeys: KeyConfig[][] = [
    [
      { label: "1", value: "1", type: "number", ariaLabel: "Number 1" },
      { label: "2", value: "2", type: "number", ariaLabel: "Number 2" },
      { label: "3", value: "3", type: "number", ariaLabel: "Number 3" },
    ],
    [
      { label: "4", value: "4", type: "number", ariaLabel: "Number 4" },
      { label: "5", value: "5", type: "number", ariaLabel: "Number 5" },
      { label: "6", value: "6", type: "number", ariaLabel: "Number 6" },
    ],
    [
      { label: "7", value: "7", type: "number", ariaLabel: "Number 7" },
      { label: "8", value: "8", type: "number", ariaLabel: "Number 8" },
      { label: "9", value: "9", type: "number", ariaLabel: "Number 9" },
    ],
    [
      {
        label: ".00",
        value: ".",
        type: "decimal",
        ariaLabel: "Decimal point",
      },
      { label: "0", value: "0", type: "number", ariaLabel: "Number 0" },
      {
        label: <Delete size={22} />,
        value: "backspace",
        type: "clear",
        ariaLabel: "Backspace",
      },
    ],
  ];

  return (
    <div className={cn("w-full select-none flex gap-2", className)}>
      {/* Main number grid */}
      <div className="flex-1 grid grid-cols-3 gap-2 auto-rows-fr">
        {gridKeys.flat().map((key) => (
          <KeypadKey
            key={key.ariaLabel}
            config={key}
            onPress={() => handleKeyPress(key.value, key.type)}
            disabled={disabled}
            prefersReduced={prefersReduced}
          />
        ))}

        {/* Enter spans full width */}
        <motion.button
          className={cn(
            "col-span-3 h-14 rounded-xl font-bold text-[15px]",
            "bg-[var(--keypad-enter,var(--interactive-primary,#007AFF))] text-white",
            "shadow-[0_4px_0_var(--keypad-enter-active,#0051A8)]",
            "active:bg-[var(--keypad-enter-active,#0066CC)] active:shadow-none",
            "flex items-center justify-center gap-2",
            "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
            disabled && "opacity-40 pointer-events-none",
          )}
          aria-label="Submit transaction"
          whileTap={
            prefersReduced
              ? {}
              : {
                  scale: 0.97,
                  y: 3,
                  boxShadow: "0 0px 0 var(--keypad-enter-active,#0051A8)",
                }
          }
          transition={{
            type: "spring",
            stiffness: 500,
            damping: 28,
            mass: 0.5,
          }}
          onClick={() => handleKeyPress("enter", "enter")}
          disabled={disabled}
          style={{ touchAction: "manipulation" }}
        >
          <CornerDownLeft size={18} />
          {enterLabel}
        </motion.button>
      </div>

      {/* Quick-add sidebar */}
      {onQuickAdd && (
        <div className="flex flex-col gap-2 w-16">
          {quickAddValues.map((val) => (
            <motion.button
              key={val}
              className={cn(
                "flex-1 rounded-xl font-semibold text-[13px]",
                "bg-[#F0FFF4] text-[var(--success-500,#34C759)]",
                "shadow-[0_2px_0_#C8E6D0]",
                "active:bg-[#E0F5E5] active:shadow-none",
                "outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30",
                disabled && "opacity-40 pointer-events-none",
              )}
              whileTap={
                prefersReduced
                  ? {}
                  : { scale: 0.93, y: 2, boxShadow: "0 0px 0 #C8E6D0" }
              }
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 28,
                mass: 0.5,
              }}
              onClick={() => onQuickAdd(val)}
              disabled={disabled}
              aria-label={`Add ${val}`}
              style={{ touchAction: "manipulation" }}
            >
              +{val}
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
