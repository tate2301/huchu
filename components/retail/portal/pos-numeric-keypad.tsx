"use client";

import { Button } from "@/components/ui/button";
import { XCircle } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { PosKeypadAction } from "./pos-numeric-input";

type PosNumericKeypadProps = {
  title?: string;
  onAction: (action: PosKeypadAction) => void;
  presets?: Array<{ label: string; value: string }>;
  className?: string;
  /** Use smaller buttons for viewport-locked layouts. */
  compact?: boolean;
};

const KEYS: Array<{ label: string; action: PosKeypadAction }> = [
  { label: "1", action: { type: "digit", value: "1" } },
  { label: "2", action: { type: "digit", value: "2" } },
  { label: "3", action: { type: "digit", value: "3" } },
  { label: "4", action: { type: "digit", value: "4" } },
  { label: "5", action: { type: "digit", value: "5" } },
  { label: "6", action: { type: "digit", value: "6" } },
  { label: "7", action: { type: "digit", value: "7" } },
  { label: "8", action: { type: "digit", value: "8" } },
  { label: "9", action: { type: "digit", value: "9" } },
  { label: ".", action: { type: "decimal" } },
  { label: "0", action: { type: "digit", value: "0" } },
];

export function PosNumericKeypad({
  onAction,
  presets = [],
  className,
  compact = false,
}: PosNumericKeypadProps) {
  const btnSize = compact ? "min-h-[2.75rem]" : "min-h-14";
  const textSize = compact ? "text-lg" : "text-xl";
  const gap = compact ? "gap-1.5" : "gap-2";

  return (
    <div className={cn("flex flex-col", gap, className)}>
      {presets.length ? (
        <div className={cn("grid grid-cols-3", gap)}>
          {presets.map((preset) => (
            <Button
              key={`${preset.label}:${preset.value}`}
              type="button"
              variant="outline"
              className={cn(
                "rounded-lg text-xs font-medium",
                compact ? "min-h-[2.25rem]" : "min-h-11 rounded-2xl",
              )}
              onClick={() => onAction({ type: "preset", value: preset.value })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className={cn("grid flex-1 grid-cols-3", gap)}>
        {KEYS.map((key) => (
          <Button
            key={key.label}
            type="button"
            variant="outline"
            className={cn(btnSize, "rounded-lg font-medium", textSize)}
            onClick={() => onAction(key.action)}
          >
            {key.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className={cn(btnSize, "rounded-lg text-xs font-semibold")}
          onClick={() => onAction({ type: "clear" })}
        >
          C
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn(btnSize, "rounded-lg")}
          onClick={() => onAction({ type: "backspace" })}
        >
          <XCircle className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
