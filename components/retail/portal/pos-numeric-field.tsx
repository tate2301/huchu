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
        "h-auto min-h-[4.75rem] w-full items-start justify-start rounded-[1.2rem] px-4 py-3 text-left shadow-none",
        active
          ? "border-[var(--action-primary-bg)] bg-[color-mix(in_srgb,var(--action-primary-bg)_8%,white)]"
          : "border-[var(--border-default)] bg-[var(--surface-base)] hover:bg-[var(--surface-muted)]",
        className,
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {label}
      </span>
      <span className="mt-2 font-mono text-xl font-semibold text-[var(--text-strong)]">
        {value || placeholder}
      </span>
    </Button>
  );
}
