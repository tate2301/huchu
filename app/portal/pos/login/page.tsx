import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { companyLabelFromHost } from "@/lib/utils";
import { PosPortalLoginClient } from "./client";

export default async function PosPortalLoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/portal/pos");
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const companyLabel = companyLabelFromHost(host, "Store");

  return <PosPortalLoginClient companyLabel={companyLabel} />;
}
