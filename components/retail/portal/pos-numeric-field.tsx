"use client";

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
    <button
      type="button"
      onClick={onActivate}
      className={cn(
        "flex min-h-[4.5rem] w-full flex-col items-start justify-center rounded-xl border px-4 py-3 text-left transition-all duration-100",
        className,
      )}
      style={
        active
          ? {
              background: "var(--pos-lcd-bg-active)",
              borderColor: "var(--pos-lcd-text-active)",
              boxShadow: `0 0 0 2px var(--pos-lcd-text-active)`,
              color: "var(--pos-lcd-text)",
            }
          : {
              background: "var(--pos-lcd-bg)",
              borderColor: "var(--pos-lcd-border)",
              color: "var(--pos-lcd-text)",
            }
      }
    >
      <span
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: "var(--pos-lcd-label)" }}
      >
        {label}
      </span>
      <span
        className="mt-1 font-mono text-xl font-black tabular-nums tracking-tight"
        style={{ color: active ? "var(--pos-lcd-text-active)" : "var(--pos-lcd-text)" }}
      >
        {value || <span style={{ color: "var(--pos-lcd-label)" }}>{placeholder}</span>}
      </span>
    </button>
  );
}
