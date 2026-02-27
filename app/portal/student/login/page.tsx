import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { companyLabelFromHost } from "@/lib/utils";
import { StudentPortalLoginClient } from "./client";

export default async function StudentPortalLoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/portal/student");
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const companyLabel = companyLabelFromHost(host, "School");

  return <StudentPortalLoginClient companyLabel={companyLabel} />;
}
