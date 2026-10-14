import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { RepDetailPage } from "@/components/crm/reps/rep-detail-page";
import { authOptions } from "@/lib/auth";

export default async function CrmRepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  // "My performance" in the navigation is whoever is signed in, shown at its
  // own address so its row stays the page (a redirect to the person's id
  // made Team the page instead).
  const repId = id === "me" ? session.user.id : id;

  return (
    <CrmPage width="detail">
      <RepDetailPage repId={repId} />
    </CrmPage>
  );
}
