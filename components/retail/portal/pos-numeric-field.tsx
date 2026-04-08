"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PosNumericFieldProps = {
  label: string;
  value: string;
  active?: boolean;
  onActivate: () => void;
  placeholder?: string;
  className?: string;
};

export function PosNumericField({
  label,
  value,
  active = false,
  onActivate,
  placeholder = "0",
  className,
}: PosNumericFieldProps) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onActivate}
      className={cn(
        "h-auto min-h-14 w-full flex-col items-start gap-1 px-3 py-2 text-left",
        active
          ? "border-[var(--action-primary-bg)] bg-[var(--action-secondary-bg)]"
          : "bg-[var(--surface-base)]",
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="font-mono text-base font-semibold text-[var(--text-strong)]">
        {value || placeholder}
      </span>
    </Button>
  );
}
