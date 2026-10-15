import { notFound } from "next/navigation";

import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { SetUpForm } from "@/components/admin/workspaces/set-up-form";
import { getPlatformRootDomain } from "@/lib/admin/hosts";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";

import { setUp } from "./actions";

export const metadata = { title: "Set up a workspace · Corelith admin" };

export default async function SetUpWorkspacePage() {
  const operator = await requireOperator();
  if (!operatorCan(operator.role, "workspace.setUp")) notFound();
  return (
    <AdminPage>
      <AdminPageHeader title="Set up a workspace" />
      <SetUpForm root={getPlatformRootDomain()} setUp={setUp} />
    </AdminPage>
  );
}
