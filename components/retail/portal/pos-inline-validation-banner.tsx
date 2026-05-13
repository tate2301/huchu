"use client";

import { AlertTriangle } from "@/lib/icons";
import { PosStatusPill } from "./pos-primitives";

type PosInlineValidationBannerProps = {
  messages: string[];
};

export function PosInlineValidationBanner({ messages }: PosInlineValidationBannerProps) {
  if (messages.length === 0) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 ring-1"
      style={{
        background: "var(--pos-status-warning-bg)",
        boxShadow: `inset 0 0 0 1px var(--pos-status-warning-ring)`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PosStatusPill tone="warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          Checkout blockers
        </PosStatusPill>
        <span
          className="text-xs font-medium"
          style={{ color: "var(--pos-status-warning-text)" }}
        >
          Fix these before taking payment.
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {messages.slice(0, 3).map((message) => (
          <div
            key={message}
            className="rounded-lg bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-strong)] ring-1 ring-[var(--edge-subtle)]"
          >
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}
