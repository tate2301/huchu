import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { CollectionsContent } from "@/components/crm/collections/collections-content";
import { authOptions } from "@/lib/auth";

export default async function CrmCollectionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <CollectionsContent />
    </CrmPage>
  );
}
