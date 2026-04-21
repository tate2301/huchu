import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const skeletonVariants = cva(
  "rounded-[var(--button-radius)] bg-[var(--surface-soft)]",
  {
    variants: {
      variant: {
        default: "animate-pulse shadow-[var(--surface-frame-shadow)]",
        shimmer:
          "relative overflow-hidden shadow-[var(--surface-frame-shadow)] before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.5s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Skeleton({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof skeletonVariants>) {
  return (
    <div
      data-slot="skeleton"
      data-variant={variant ?? "default"}
      className={cn(skeletonVariants({ variant, className }))}
      {...props}
    />
  );
}

/* ── Skeleton Group for layouts ──────────────────────────────────────────── */

function SkeletonGroup({
  className,
  lines = 3,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { lines?: number }) {
  return (
    <div
      data-slot="skeleton-group"
      className={cn("flex flex-col gap-3", className)}
      {...props}
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4 w-full"
          style={{ width: `${100 - (i % 3) * 15}%` }}
        />
      ))}
    </div>
  );
}

/* ── Skeleton Card for card-shaped loading states ────────────────────────── */

function SkeletonCard({
  className,
  header = true,
  lines = 2,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  header?: boolean;
  lines?: number;
}) {
  return (
    <div
      data-slot="skeleton-card"
      className={cn(
        "rounded-[var(--card-radius)] border border-[var(--border-default)] bg-[var(--surface-base)] p-4 shadow-[var(--card-shadow-rest)]",
        className
      )}
      {...props}
    >
      {header && (
        <div className="mb-3 flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-[var(--mobile-list-icon-radius)]" variant="shimmer" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-1/3" variant="shimmer" />
            <Skeleton className="h-3 w-1/4" variant="shimmer" />
          </div>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-3"
            variant="shimmer"
            style={{ width: `${100 - (i % 3) * 20}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export { Skeleton, SkeletonGroup, SkeletonCard };
