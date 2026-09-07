import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { ImportWizard } from "../../../components/import/import-wizard";
import { hasCrmFullAccess } from "../../../scope";

export default async function CrmImportPage() {
  const session = await getCurrentAuthSession();
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
