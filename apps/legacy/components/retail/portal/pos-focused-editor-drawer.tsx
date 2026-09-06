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
    <section
      className="rounded-2xl border border-[var(--edge-default)] bg-[var(--surface-base)] px-4 py-4"
      style={{ boxShadow: "var(--shadow-card, 0 1px 3px rgba(15,23,42,0.06), 0 8px 24px rgba(15,23,42,0.06))" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
            Line editor
          </div>
          <div className="mt-1 text-lg font-bold tracking-[-0.025em] text-[var(--text-strong)]">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-1 text-sm text-[var(--text-muted)]">{subtitle}</div>
          ) : null}
        </div>
        <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
