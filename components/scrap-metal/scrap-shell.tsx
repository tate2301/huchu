"use client";

import type { ReactNode } from "react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";
import { cn } from "@/lib/utils";

type ScrapShellProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function ScrapShell({ title, actions, children, className, contentClassName }: ScrapShellProps) {
  return (
    <div className={cn("flex min-h-full w-full flex-col gap-3 md:gap-6", className)}>
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} className="mb-0 shrink-0" />
      <div
        className={cn(
          "min-h-0 flex-1 space-y-4 pb-6 md:space-y-6 md:pb-0",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
