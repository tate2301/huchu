"use client";

import { ManagementShell } from "@/components/settings/management-shell";

export type MasterDataTab =
  | "overview"
  | "departments"
  | "job-grades"
  | "sites"
  | "sections"
  | "downtime-codes"
  | "gold-expense-types"
  | "scrap-materials"
  | "scrap-sellers";

type MasterDataShellProps = {
  activeTab: MasterDataTab;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export function MasterDataShell({
  activeTab,
  title,
  description,
  actions,
  children,
}: MasterDataShellProps) {
  void activeTab;
  void description;
  return (
    <ManagementShell area="master-data" title={title} actions={actions}>
      {children}
    </ManagementShell>
  );
}
