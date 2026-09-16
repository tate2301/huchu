import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ConductIncidentPage } from "@/components/schools/conduct/conduct-incident-page";
import { authOptions } from "@/lib/auth";

/**
 * One incident — S-12.1, and the only home S-12.2 has.
 *
 * `/schools/conduct/merits` and `/schools/conduct/detention` are static
 * segments and take precedence over this one in Next's routing. Incident ids
 * are uuids so nothing collides in practice, but the ordering is a fact about
 * the route tree rather than a coincidence worth relying on — a future segment
 * called `pastoral` would shadow an incident called `pastoral` if ids were ever
 * slugs.
 */
export default async function SchoolsConductIncidentRoute({
  params,
}: {
  params: Promise<{ incidentId: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { incidentId } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ConductIncidentPage incidentId={incidentId} />
    </div>
  );
}
