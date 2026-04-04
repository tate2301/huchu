import { cn } from "@/lib/utils"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-6 w-fit min-w-6 items-center justify-center gap-1 rounded-[8px] border border-[var(--border-default)] bg-[var(--surface-subtle)] px-1.5 font-sans text-[11px] font-semibold text-[var(--text-muted)] shadow-[var(--surface-frame-shadow)] select-none",
        "[&_svg:not([class*='size-'])]:size-3",
        "[[data-slot=tooltip-content]_&]:border-white/20 [[data-slot=tooltip-content]_&]:bg-white/12 [[data-slot=tooltip-content]_&]:text-white [[data-slot=tooltip-content]_&]:shadow-none",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
