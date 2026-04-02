import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "placeholder:text-[var(--text-muted)] flex min-h-20 w-full rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--text-primary)] transition-all duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-default)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]/30 focus-visible:ring-offset-0 focus-visible:border-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        "hover:border-[var(--border-strong)] aria-invalid:border-[var(--action-danger-bg)] aria-invalid:ring-[var(--action-danger-bg)]/30",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
