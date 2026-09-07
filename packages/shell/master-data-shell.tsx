"use client";

import { ManagementShell } from "./management-shell";

export type MasterDataTab =
  | "overview"
  | "departments"
  | "job-grades"
  | "sites"
  | "sections"
  | "downtime-codes"
  | "gold-expense-types"
  | "scrap-materials"
  | "scrap-sellers"
  // A school's academic ladder is reference data too, so it sits in this area
  // rather than in the school's own sidebar. The ids match `management-nav`.
  | "schools-years"
  | "schools-classes"
  | "schools-subjects"
  | "schools-school-day"
  | "schools-grading"
  | "schools-identity";

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
  return (
    <ManagementShell area="master-data" title={title} description={description} actions={actions}>
      {children}
    </ManagementShell>
  );
}
