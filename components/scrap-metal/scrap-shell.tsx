"use client";

import type { ReactNode } from "react";

import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";

type ScrapShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function ScrapShell({ title, description, actions, children }: ScrapShellProps) {
  return (
    <div className="w-full space-y-4 md:space-y-6">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} className="mb-0" />
      <div className="space-y-4 md:space-y-6">{children}</div>
    </div>
  );
}
