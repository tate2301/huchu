import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmSettingsShell } from "@/components/crm/crm-settings-shell";
import { authOptions } from "@/lib/auth";

export default async function CrmSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <>
      <PageChrome title="CRM settings" />
      <CrmSettingsShell />
    </>
  );
}
