import type { WorkspaceProduct } from "@prisma/client";

import { Briefcase, Buildings, Gem, Payments, Recycle, Storefront, Zap, type LucideIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * A workspace's mark: what it runs, on a quiet tile. Flare, Pabasa and Tender are one thing
 * whatever their profile says; a Corelith workspace shows the business it was set up as.
 * The book icon set has no school, so a school takes the generic building.
 */
const PROFILE_ICON: Record<string, LucideIcon> = {
  "Gold mine": Gem,
  "Scrap metal": Recycle,
  Retail: Storefront,
  Payroll: Payments,
};

/** A product that is one thing has its own mark whatever its profile says. */
const PRODUCT_ICON: Partial<Record<WorkspaceProduct, LucideIcon>> = { FLARE: Zap, PABASA: Briefcase, TENDER: Storefront };

export function WorkspaceMark({
  product,
  profile,
  size = "md",
  className,
}: {
  product: WorkspaceProduct;
  profile: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = PRODUCT_ICON[product] ?? (profile ? PROFILE_ICON[profile] : undefined) ?? Buildings;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex flex-none items-center justify-center rounded-[var(--radius-sm)] bg-[var(--tray)] text-[var(--ink-2)] shadow-[inset_0_0_0_1px_var(--line)]",
        size === "md" ? "size-8 [&_svg]:size-4" : "size-6 [&_svg]:size-3.5",
        className,
      )}
    >
      <Icon />
    </span>
  );
}
