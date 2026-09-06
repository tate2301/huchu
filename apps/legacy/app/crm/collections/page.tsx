import { getServerSession } from "next-auth";
import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { redirect } from "next/navigation";

import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CollectionsContent } from "@corelithzw/module-crm/components/collections/collections-content";
import { authOptions } from "@/lib/auth";

export default async function CrmCollectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Collections" />
      <CollectionsContent />
    </CrmPage>
  );
}
