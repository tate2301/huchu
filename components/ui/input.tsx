import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-[var(--text-muted)] selection:bg-primary selection:text-primary-foreground flex h-[var(--input-height)] w-full min-w-0 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm shadow-none transition-all duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30 focus-visible:ring-offset-0 focus-visible:border-[var(--focus-ring)]",
        "hover:border-[var(--border-strong)] aria-invalid:border-destructive aria-invalid:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
