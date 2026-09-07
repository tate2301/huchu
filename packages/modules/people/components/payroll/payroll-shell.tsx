"use client";

import { ModuleShell } from "@corelithzw/shell/module-shell";
import {
  PAYROLL_CATEGORIES,
  PAYROLL_TABS,
  type PayrollTab,
} from "../../payroll/tab-config";

export function PayrollShell({
  activeTab,
  actions,
  children,
  title,
}: {
  activeTab: PayrollTab;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <ModuleShell
      moduleId="payroll"
      navSectionId="payroll"
      categories={PAYROLL_CATEGORIES}
      tabs={PAYROLL_TABS}
      activeTab={activeTab}
      railLabel="Payroll"
      actions={actions}
      title={title}
    >
      {children}
    </ModuleShell>
  );
}
