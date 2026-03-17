import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { companyLabelFromHost } from "@/lib/utils";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";
import { StudentPortalLoginClient } from "./client";

export default async function StudentPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/portal/student");
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect(resolvedCallbackUrl);
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const companyLabel = companyLabelFromHost(host, "School");

  return <StudentPortalLoginClient companyLabel={companyLabel} callbackUrl={resolvedCallbackUrl} />;
}
