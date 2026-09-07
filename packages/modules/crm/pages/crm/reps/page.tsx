import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { CrmPage } from "../../../components/crm-page";
import { RepsContent } from "../../../components/reps/reps-content";

export default async function CrmRepsPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");

  return (
    <CrmPage title="Reps" description="who is selling, and how they are doing">
      <RepsContent />
    </CrmPage>
  );
}
