import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { TransportContent } from "../../../components/transport/transport-content";

/**
 * Transport stays with the office.
 *
 * Routes, seats and what the bus is worth in fees are an administrator's
 * business, not a teacher's — the only classroom-adjacent thing here is the
 * driver's register, and the driver is not a teacher either.
 *
 * The heading lives inside the content component, because its primary action
 * changes with the view and is gated on the signed-in person's grants.
 */
export default async function SchoolTransportPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <TransportContent />
    </div>
  );
}
