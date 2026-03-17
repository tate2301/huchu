import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { companyLabelFromHost } from "@/lib/utils";
import { normalizeCallbackUrl } from "@/lib/auth-redirect";
import { ParentPortalLoginClient } from "./client";

export default async function ParentPortalLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const resolvedCallbackUrl = normalizeCallbackUrl(callbackUrl, "/portal/parent");
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect(resolvedCallbackUrl);
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const companyLabel = companyLabelFromHost(host, "School");

  return <ParentPortalLoginClient companyLabel={companyLabel} callbackUrl={resolvedCallbackUrl} />;
}
