import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-[var(--button-radius)] bg-[var(--surface-soft)] shadow-[var(--surface-frame-shadow)]", className)}
      {...props}
    />
  )
}

export { Skeleton }
