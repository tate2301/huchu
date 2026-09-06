"use client";

import * as React from "react";
import { ExportMenu as DsExportMenu, type ButtonSize, type ButtonVariant } from "@corelithzw/react";

import type { Button } from "@/components/ui/button";
import type { DocumentExportFormat } from "@/lib/documents/export-client";
import { ChevronDown } from "@/lib/icons";

/**
 * ExportMenu — the design system's, behind this repo's prop names.
 *
 * The dropdown, its trigger and the `.export-menu` popover are all
 * `@corelithzw/react`'s now, so Radix is gone from this surface. With 19
 * importers this is the busiest file in the layout/navigation migration, and
 * every one of them keeps compiling because four things are deliberately held
 * in place:
 *
 *   - **`onExport` stays narrow.** The DS hands back a bare `string` id; call
 *     sites annotate their callback as
 *     `(format: DocumentExportFormat) => void | Promise<void>` explicitly, so
 *     widening it would break all 19. The id is narrowed by looking it up in
 *     the active format list — a lookup, not a cast, so the type is earned.
 *   - **`className` still styles the trigger.** The DS `className` styles the
 *     menu *content*, which is portalled to `document.body`; the trigger is
 *     reached through its new `triggerClassName`. Passing local `className`
 *     straight through would have silently moved every caller's classes onto a
 *     different element (`app/gold/exceptions` relies on `[&_svg]:mr-0` hitting
 *     the trigger's chevron).
 *   - **The busy state is preserved.** `exportingFormat` still disables the
 *     trigger and every item and relabels the button `Exporting PDF...`.
 *   - **`align` still defaults to `"end"`.** The DS defaults it to `"start"`.
 *
 * The one genuinely local bit is the `variant`/`size` mapping below. The DS
 * `ExportMenu` owns its trigger element, so this repo's shadcn-flavoured names
 * cannot be routed through `@/components/ui/button` — they are mapped onto the
 * DS `Button` axis here the same way `button.tsx` maps them. Keep the two in
 * step.
 *
 * New code should import `ExportMenu` from `@corelithzw/react` and use its
 * `formats` / `triggerProps` API.
 */
const TRIGGER_VARIANT: Record<string, ButtonVariant> = {
  default: "primary",
  primary: "primary",
  secondary: "secondary",
  // The DS has no outline variant — secondary already carries the border.
  outline: "secondary",
  ghost: "ghost",
  quiet: "quiet",
  link: "link",
  destructive: "destructive",
  danger: "danger",
};

const TRIGGER_SIZE: Record<string, ButtonSize> = {
  default: "md",
  sm: "sm",
  lg: "lg",
  icon: "md",
  "icon-sm": "sm",
  "icon-lg": "lg",
};

type ExportMenuProps = {
  onExport: (format: DocumentExportFormat) => void | Promise<void>;
  disabled?: boolean;
  exportingFormat?: DocumentExportFormat | null;
  label?: string;
  className?: string;
  align?: "start" | "center" | "end";
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  formats?: DocumentExportFormat[];
};

const defaultFormats: DocumentExportFormat[] = ["pdf", "csv"];

export function ExportMenu({
  onExport,
  disabled = false,
  exportingFormat = null,
  label = "Export",
  className,
  align = "end",
  variant = "outline",
  size = "sm",
  formats = defaultFormats,
}: ExportMenuProps) {
  const activeFormats = formats.length > 0 ? formats : defaultFormats;
  const isBusy = Boolean(exportingFormat);

  return (
    <DsExportMenu
      align={align}
      triggerClassName={className}
      triggerProps={{
        variant: TRIGGER_VARIANT[variant ?? "outline"] ?? "secondary",
        size: TRIGGER_SIZE[size ?? "sm"] ?? "sm",
        disabled: disabled || isBusy,
        endIcon: <ChevronDown className="h-4 w-4" />,
      }}
      label={isBusy ? `Exporting ${String(exportingFormat).toUpperCase()}...` : label}
      formats={activeFormats.map((format) => ({
        id: format,
        label: `Export as ${format.toUpperCase()}`,
        disabled: disabled || isBusy,
      }))}
      onExport={(id) => {
        if (disabled || isBusy) return;
        // A lookup rather than a cast: this is what narrows the DS's `string`
        // back to `DocumentExportFormat` for the caller's callback.
        const format = activeFormats.find((candidate) => candidate === id);
        if (!format) return;
        const maybePromise = onExport(format);
        if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
          void (maybePromise as Promise<unknown>).catch(() => undefined);
        }
      }}
    />
  );
}
