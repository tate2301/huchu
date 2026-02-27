import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { ParentPortalLoginClient } from "./client";

export default async function ParentPortalLoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) {
    redirect("/portal/parent");
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost";
  const hostParts = host.split(".");
  const companyLabel =
    hostParts.length > 2
      ? hostParts[1]
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      : "School";

  return <ParentPortalLoginClient companyLabel={companyLabel} />;
}
