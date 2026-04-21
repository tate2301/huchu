import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Error state: red border + subtle red bg tint */
  error?: boolean;
  /** Success state: green border */
  success?: boolean;
  /** Input size variant */
  inputSize?: "sm" | "md" | "lg";
}

/**
 * Attio-inspired input with refined styling.
 *
 * - 10px rounded corners
 * - Subtle border that becomes clearer on focus
 * - Error state: red border + subtle red background tint
 * - Success state: green border
 * - Mobile font-size 16px to prevent iOS zoom
 * - Sizes: sm (32px), md (36px), lg (40px)
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      error = false,
      success = false,
      inputSize = "md",
      disabled,
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "h-8 px-2.5 text-[13px]",
      md: "h-9 px-3 text-sm",
      lg: "h-10 px-3.5 text-base",
    };

    return (
      <input
        type={type}
        data-slot="input"
        data-error={error ? "true" : undefined}
        data-success={success ? "true" : undefined}
        data-size={inputSize}
        disabled={disabled}
        className={cn(
          // Base styles
          "flex w-full min-w-0 rounded-[10px] border bg-[var(--input-bg)] py-2 shadow-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] outline-none",
          "file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-[var(--text-subtle)]",
          "focus-visible:border-[var(--focus-ring)] focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-offset-0",
          "hover:border-[var(--border-strong)]",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
          // Mobile: prevent iOS zoom by using 16px minimum
          "text-base sm:text-sm",
          // Size classes
          sizeClasses[inputSize],
          // Default border
          !error && !success && "border-[var(--input-border)]",
          // Error state
          error &&
            "border-[var(--status-error-border)] bg-[var(--status-error-bg)]/40 focus-visible:border-[var(--status-error-border)] focus-visible:ring-destructive/20",
          // Success state
          success &&
            "border-[var(--status-success-border)] focus-visible:border-[var(--status-success-border)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
