import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

export default async function CrmConfigPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const resolved = searchParams ? await searchParams : undefined;
  const sp = new URLSearchParams();
  if (resolved) {
    for (const [key, value] of Object.entries(resolved)) {
      if (typeof value === "string") sp.set(key, value);
      else if (Array.isArray(value)) value.forEach((v) => sp.append(key, v));
    }
  }
  const query = sp.toString();
  redirect(`/crm/settings${query ? `?${query}` : ""}`);
}
