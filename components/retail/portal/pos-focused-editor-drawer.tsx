"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { X } from "@/lib/icons";

type PosFocusedEditorDrawerProps = {
  title: string;
  subtitle?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function PosFocusedEditorDrawer({
  title,
  subtitle,
  open,
  onClose,
  children,
}: PosFocusedEditorDrawerProps) {
  if (!open) return null;
  return (
    <section className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface-base)] px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {subtitle ? <div className="text-xs text-[var(--text-muted)]">{subtitle}</div> : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
