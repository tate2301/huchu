import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmFollowUpsContent } from "../../../components/crm-follow-ups-content";

export default async function CrmFollowUpsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Follow-ups" />
      <CrmFollowUpsContent />
    </CrmPage>
  );
}
