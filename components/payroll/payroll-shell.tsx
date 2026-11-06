"use client";

import type { PagePrimary } from "@/components/layout/page-chrome";
import { ModuleShell } from "@/components/shared/module-shell";
import {
  PAYROLL_CATEGORIES,
  PAYROLL_TABS,
  type PayrollTab,
} from "@/lib/payroll/tab-config";

export function PayrollShell({
  activeTab,
  actions,
  primary,
  children,
  title,
}: {
  activeTab?: PayrollTab;
  actions?: React.ReactNode;
  primary?: PagePrimary;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <ModuleShell
      navSectionId="payroll"
      categories={PAYROLL_CATEGORIES}
      tabs={PAYROLL_TABS}
      activeTab={activeTab}
      railLabel="Payroll"
      actions={actions}
      primary={primary}
      title={title}
    >
      {children}
    </ModuleShell>
  );
}
