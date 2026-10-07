import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { roleMeetsRetailRequires } from "@/lib/retail/nav";
import { setupNav } from "@/lib/retail/nav/setup";

/**
 * `/retail/manage` opens the first Setup page this person may see (Shop for
 * the owner, manager and bookkeeper). Someone with none goes to the overview.
 */
export default async function SetupIndexPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const first = setupNav.items.find((item) => roleMeetsRetailRequires(session.user.role, item.requires));
  redirect(first?.href ?? "/retail");
}
