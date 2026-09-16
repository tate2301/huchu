import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { HouseRecordContent } from "@/components/schools/boarding/house-record-content";
import { authOptions } from "@/lib/auth";

/**
 * One boarding house.
 *
 * Thin on purpose: the page's tabs, its primary action and everything it shows
 * turn on what the signed-in person may do and on which tab they are holding,
 * and neither is a question a server component can answer. The guard is the
 * one thing that belongs out here.
 */
export default async function BoardingHouseRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <HouseRecordContent houseId={id} />
    </div>
  );
}
