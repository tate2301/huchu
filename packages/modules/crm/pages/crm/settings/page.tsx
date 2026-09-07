import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmSettingsShell } from "../../../components/crm-settings-shell";

export default async function CrmSettingsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  return (
    <>
      <PageChrome title="CRM settings" />
      <CrmSettingsShell />
    </>
  );
}
