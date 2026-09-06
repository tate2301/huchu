"use client";

import { ModuleShell } from "@corelithzw/shell/module-shell";
import {
  PEOPLE_CATEGORIES,
  PEOPLE_TABS,
  type PeopleTab,
} from "@/lib/people/tab-config";

export function PeopleShell({
  activeTab,
  actions,
  children,
  title,
}: {
  activeTab: PeopleTab;
  actions?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <ModuleShell
      moduleId="people"
      navSectionId="people"
      categories={PEOPLE_CATEGORIES}
      tabs={PEOPLE_TABS}
      activeTab={activeTab}
      railLabel="People"
      actions={actions}
      title={title}
    >
      {children}
    </ModuleShell>
  );
}
