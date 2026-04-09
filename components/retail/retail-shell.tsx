"use client";

import type { ReactNode } from "react";
import { PageActions } from "@/components/layout/page-actions";
import { PageHeading } from "@/components/layout/page-heading";

type RetailShellProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function RetailShell({ title, description, actions, children }: RetailShellProps) {
  return (
    <div className="w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} className="mb-2" />
      <div className="space-y-4">{children}</div>
    </div>
  );
}
