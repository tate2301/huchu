"use client";

import { AlertTriangle } from "@/lib/icons";

type PosInlineValidationBannerProps = {
  messages: string[];
};

export function PosInlineValidationBanner({ messages }: PosInlineValidationBannerProps) {
  if (messages.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-900">
        <AlertTriangle className="h-4 w-4" />
        Before charging
      </div>
      <div className="mt-1 space-y-1">
        {messages.slice(0, 3).map((message) => (
          <div key={message} className="text-xs text-amber-900">
            {message}
          </div>
        ))}
      </div>
    </div>
  );
}
