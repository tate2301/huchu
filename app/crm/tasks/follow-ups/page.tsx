import { getServerSession } from "next-auth";
import { CrmPage } from "@/components/crm/crm-page";
import { redirect } from "next/navigation";
import { CrmFollowUpsContent } from "@/components/crm/crm-follow-ups-content";
import { authOptions } from "@/lib/auth";

export default async function CrmFollowUpsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <CrmFollowUpsContent />
    </CrmPage>
  );
}
