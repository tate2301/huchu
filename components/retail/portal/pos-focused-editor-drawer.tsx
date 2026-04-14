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
    <section className="rounded-[1.4rem] border border-[var(--border-default)] bg-[color-mix(in_srgb,var(--surface-base)_88%,var(--surface-muted))] px-4 py-4 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Line editor
          </div>
          <div className="mt-1 text-lg font-semibold tracking-[-0.02em]">{title}</div>
          {subtitle ? <div className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</div> : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
