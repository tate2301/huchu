"use client";

import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

/**
 * Mobile list — the design system's, re-exported under the same names.
 *
 * Every row primitive now lives in `@corelithzw/react`
 * (`src/primitives/MobileList.tsx`) with the same `data-slot` attributes this
 * file used to emit, so the one importer (the settlements list, which
 * uses 9 of these including `MobileListIcon variant="brand"`) is unchanged. The
 * Tailwind strings are now `.mobile-list*` rules in the DS's `mobile.css`.
 *
 * Three small gains come with the swap: the container is `role="list"`,
 * `MobileListItem`'s `href` actually renders an `<a>` (this file declared the
 * prop and ignored it), and `MobileListChevron` draws its own inline glyph
 * instead of pulling one from `@/lib/icons`.
 *
 * `MobileListStatus` stays local. It is not a DS component — it is a wrapper
 * around this repo's `StatusDot`, which owns the status→colour vocabulary the
 * DS knows nothing about.
 *
 * New code should import these from `@corelithzw/react`; `MobileList.Row` is
 * the shorthand for a four-slot row.
 */
export {
  MobileList,
  MobileListItem,
  MobileListIcon,
  MobileListContent,
  MobileListTitle,
  MobileListSubtitle,
  MobileListMeta,
  MobileListMetaText,
  MobileListChevron,
  MobileListBadge,
  MobileListEmpty,
  MobileListSectionHeader,
} from "@corelithzw/react";

type MobileListStatusProps = {
  status: string;
  label?: string;
  className?: string;
};

function MobileListStatus({ status, label, className }: MobileListStatusProps) {
  return (
    <div data-slot="mobile-list-status" className={cn("shrink-0", className)}>
      <StatusDot status={status} label={label} />
    </div>
  );
}

export { MobileListStatus };
