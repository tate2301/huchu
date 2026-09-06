"use client";

import Link from "next/link";

import { useGuidedMode } from "@/hooks/use-guided-mode";

type ContextHelpProps = {
  href: string;
  message?: string;
};

export function ContextHelp({
  href,
  message = "Need help? Open quick tips for this task.",
}: ContextHelpProps) {
  const { enabled } = useGuidedMode();

  if (!enabled) {
    return null;
  }

  return (
    <div className="rounded-md border border-border bg-[var(--status-info-bg)] px-3 py-2 text-sm text-[var(--status-info-text)]">
      <span>{message} </span>
      <Link href={href} className="font-semibold underline-offset-2 hover:underline">
        View tips
      </Link>
    </div>
  );
}
