import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { RepsContent } from "@/components/crm/reps/reps-content";
import { authOptions } from "@/lib/auth";

export default async function CrmTeamPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Team" description="who is on it, and what each of them is carrying">
      <RepsContent />
    </CrmPage>
  );
}
