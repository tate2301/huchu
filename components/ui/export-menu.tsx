"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { DocumentExportFormat } from "@/lib/documents/export-client";
import { ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size={size}
          variant={variant}
          disabled={disabled || isBusy}
          className={cn(className)}
        >
          {isBusy ? `Exporting ${String(exportingFormat).toUpperCase()}...` : label}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        {activeFormats.map((format) => (
          <DropdownMenuItem
            key={format}
            disabled={disabled || isBusy}
            onSelect={(event) => {
              event.preventDefault();
              if (disabled || isBusy) return;
              const maybePromise = onExport(format);
              if (maybePromise && typeof (maybePromise as Promise<unknown>).then === "function") {
                void (maybePromise as Promise<unknown>).catch(() => undefined);
              }
            }}
          >
            Export as {format.toUpperCase()}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
