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
    <div className="w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} className="mb-2" />
      <div className="space-y-4">{children}</div>
    </div>
  );
}
