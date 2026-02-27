import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground flex h-9 w-full min-w-0 rounded-[10px] border border-[var(--edge-default)] bg-[var(--surface-panel)] px-3 py-1.5 text-sm shadow-none transition-[background-color,border-color,box-shadow] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-semibold disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:ring-2 focus-visible:ring-ring/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--focus-ring-offset)]",
        "hover:border-[var(--edge-strong)] hover:bg-[var(--surface-subtle)] aria-invalid:border-destructive aria-invalid:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
