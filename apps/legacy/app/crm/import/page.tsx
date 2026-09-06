import { getServerSession } from "next-auth";
import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { ImportWizard } from "@corelithzw/module-crm/components/import/import-wizard";
import { authOptions } from "@/lib/auth";
import { hasCrmFullAccess } from "@corelithzw/module-crm/scope";

export default async function CrmImportPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  // Import writes across the whole tenant's book, so the page itself is
  // manager-only rather than showing a form that always ends in a 403.
  if (!hasCrmFullAccess(session.user.role)) redirect("/crm");

  return (
    <CrmPage width="narrow">
      <PageChrome title="Import" />
      <ImportWizard />
    </CrmPage>
  );
}
