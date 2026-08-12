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

/**
 * The retail page frame.
 *
 * `description` is forwarded to `PageHeading`, which renders it in the design
 * system's `lede` slot. It used to be accepted and dropped — the same bug
 * `PageHeading` itself carried until it was fixed for the 73 pages that use it
 * directly, and which survived here because this shell sits in between. Five
 * setup screens had written explanatory copy that never reached a user.
 */
export function RetailShell({ title, description, actions, children }: RetailShellProps) {
  return (
    <div className="w-full space-y-4">
      {actions ? <PageActions>{actions}</PageActions> : null}
      <PageHeading title={title} description={description} className="mb-2" />
      <div className="space-y-4">{children}</div>
    </div>
  );
}
