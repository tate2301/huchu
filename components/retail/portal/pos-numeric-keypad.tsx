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
  title = "Keypad",
  onAction,
  presets = [],
  className,
}: PosNumericKeypadProps) {
  return (
    <section
      className={cn(
        "rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-base)] px-3 py-3",
        className,
      )}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {title}
      </div>
      {presets.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {presets.map((preset) => (
            <Button
              key={`${preset.label}:${preset.value}`}
              type="button"
              variant="outline"
              className="min-h-11 text-xs"
              onClick={() => onAction({ type: "preset", value: preset.value })}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="mt-2 grid grid-cols-3 gap-2">
        {KEYS.map((key) => (
          <Button
            key={key.label}
            type="button"
            variant="outline"
            className="min-h-12 text-lg font-medium"
            onClick={() => onAction(key.action)}
          >
            {key.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          className="min-h-12 text-xs font-semibold"
          onClick={() => onAction({ type: "clear" })}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-12"
          onClick={() => onAction({ type: "backspace" })}
        >
          <XCircle className="h-5 w-5" />
        </Button>
      </div>
    </section>
  );
}
