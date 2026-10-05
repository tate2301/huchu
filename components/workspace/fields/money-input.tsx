"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * MoneyInput — a currency prefix (`--tray`, mono 12.5) joined to a mono
 * 14/600 right-aligned input, placeholder "0.00", decimal keypad. The value is
 * the string the form sends; leaving the field writes it with two decimals.
 */
export type MoneyCurrency = "US$" | "ZiG";

export type MoneyInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onValueChange: (value: string) => void;
  currency?: MoneyCurrency;
  /** Decimals kept on leaving the field, two at least (a rate keeps four). */
  maxDecimals?: number;
};

/**
 * "1,284.6" → "1284.60", "7" → "7.00", "" → "". With `maxDecimals` 4,
 * "26.8125" stays and "26.8" → "26.80". Anything that is not a plain amount
 * is returned as typed, for the field's schema to refuse.
 */
export function normaliseMoney(input: string, maxDecimals = 2): string {
  const trimmed = input.trim().replace(/,/g, "");
  if (trimmed === "") return "";
  if (!/^-?\d*(\.\d*)?$/.test(trimmed) || trimmed === "." || trimmed === "-") return input.trim();
  const amount = Number(trimmed);
  if (!Number.isFinite(amount)) return input.trim();
  const decimals = Math.min(Math.max((trimmed.split(".")[1] ?? "").length, 2), Math.max(maxDecimals, 2));
  return amount.toFixed(decimals);
}

export function MoneyInput({
  value,
  onValueChange,
  currency = "US$",
  maxDecimals = 2,
  className,
  onBlur,
  "aria-invalid": invalid,
  ...props
}: MoneyInputProps) {
  return (
    <span className={cn("cx-money", className)} data-invalid={invalid ? "true" : undefined}>
      <span className="cx-money__cur" aria-hidden="true">
        {currency}
      </span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        value={value}
        aria-invalid={invalid}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={(event) => {
          const next = normaliseMoney(event.target.value, maxDecimals);
          if (next !== event.target.value) onValueChange(next);
          onBlur?.(event);
        }}
        {...props}
      />
    </span>
  );
}
