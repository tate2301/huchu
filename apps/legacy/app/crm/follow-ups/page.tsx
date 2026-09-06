import { getServerSession } from "next-auth";
import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmFollowUpsContent } from "@corelithzw/module-crm/components/crm-follow-ups-content";
import { authOptions } from "@/lib/auth";

export default async function CrmFollowUpsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Follow-ups" />
      <CrmFollowUpsContent />
    </CrmPage>
  );
}
