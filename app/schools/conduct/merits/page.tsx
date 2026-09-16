import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ConductMeritsContent } from "@/components/schools/conduct/conduct-merits-content";
import { authOptions } from "@/lib/auth";

/** Merits and demerits — S-12.1, the ledger read the other way. */
export default async function SchoolsConductMeritsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ConductMeritsContent />
    </div>
  );
}
