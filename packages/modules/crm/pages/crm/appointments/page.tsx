import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../components/crm-page";
import { redirect } from "next/navigation";
import { PageChrome } from "@corelithzw/ui/layout/page-chrome";
import { CrmAppointmentsContent } from "../../../components/crm-appointments-content";

export default async function CrmAppointmentsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <PageChrome title="Site visits" />
      <CrmAppointmentsContent />
    </CrmPage>
  );
}
