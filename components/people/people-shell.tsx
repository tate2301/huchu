"use client";

import type { PagePrimary } from "@/components/layout/page-chrome";
import { ModuleShell } from "@/components/shared/module-shell";
import {
  PEOPLE_CATEGORIES,
  PEOPLE_TABS,
  type PeopleTab,
} from "@/lib/people/tab-config";

export function PeopleShell({
  activeTab,
  actions,
  primary,
  children,
  title,
}: {
  activeTab?: PeopleTab;
  actions?: React.ReactNode;
  primary?: PagePrimary;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <ModuleShell
      navSectionId="people"
      categories={PEOPLE_CATEGORIES}
      tabs={PEOPLE_TABS}
      activeTab={activeTab}
      railLabel="People"
      actions={actions}
      primary={primary}
      title={title}
    >
      {children}
    </ModuleShell>
  );
}
