import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { RepsContent } from "@corelithzw/module-crm/components/reps/reps-content";
import { authOptions } from "@/lib/auth";

export default async function CrmRepsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Reps" description="who is selling, and how they are doing">
      <RepsContent />
    </CrmPage>
  );
}
