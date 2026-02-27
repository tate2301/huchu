import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { companyLabelFromHost } from "@/lib/utils";
import { ParentPortalLoginClient } from "./client";

export default async function ParentPortalLoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/portal/parent");
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const companyLabel = companyLabelFromHost(host, "School");

  return <ParentPortalLoginClient companyLabel={companyLabel} />;
}
