import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CollectionsContent } from "../../../components/collections/collections-content";

export default async function CrmCollectionsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Collections" />
      <CollectionsContent />
    </CrmPage>
  );
}
