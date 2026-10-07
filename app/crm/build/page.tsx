import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { BuildHome } from "@/components/crm/build/build-home";
import { CrmPage } from "@/components/crm/crm-page";
import { authOptions } from "@/lib/auth";

export default async function BuildPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  return (
    <CrmPage>
      <BuildHome />
    </CrmPage>
  );
}
