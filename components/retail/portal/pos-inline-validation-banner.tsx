"use client";

import { AlertTriangle } from "@/lib/icons";
import { PosStatusPill } from "./pos-primitives";

type PosInlineValidationBannerProps = {
  messages: string[];
};

export function PosInlineValidationBanner({ messages }: PosInlineValidationBannerProps) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-[1.25rem] border border-[color-mix(in_srgb,var(--status-warning-text)_16%,white)] bg-[color-mix(in_srgb,var(--status-warning-bg)_76%,white)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <PosStatusPill tone="warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          Checkout blockers
        </PosStatusPill>
        <span className="text-xs text-[var(--status-warning-text)]">
          Fix these before taking payment.
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {messages.slice(0, 3).map((message) => (
          <div key={message} className="rounded-xl bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-strong)]">
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}
