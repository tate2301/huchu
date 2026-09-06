import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { StoresShell } from "@/components/stores/stores-shell";
import { StockLocationsPanel } from "@/components/stores/stock-locations-panel";
import { authOptions } from "@/lib/auth";

export default async function StoresLocationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  return (
    <StoresShell activeTab="locations">
      <StockLocationsPanel />
    </StoresShell>
  );
}
