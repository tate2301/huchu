import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground shadow-[var(--elevation-0)] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg+div]:translate-y-[-2px] [&>svg+div]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground",
        destructive:
          "border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)] [&>svg]:text-[var(--status-error-text)]",
        warning:
          "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)] [&>svg]:text-[var(--status-warning-text)]",
        success:
          "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-text)] [&>svg]:text-[var(--status-success-text)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
))
Alert.displayName = "Alert"

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 text-sm font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
AlertTitle.displayName = "AlertTitle"

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-muted-foreground [&_p]:leading-relaxed", className)}
    {...props}
  />
))
AlertDescription.displayName = "AlertDescription"

export { Alert, AlertTitle, AlertDescription }
