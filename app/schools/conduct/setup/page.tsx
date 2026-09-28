import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ConductSetupContent } from "@/components/schools/conduct/conduct-setup-content";
import { authOptions } from "@/lib/auth";

/**
 * The words this school logs behaviour against.
 *
 * The conduct module could not be started without it: an incident needs a
 * category, a merit needs a reason, and the two endpoints that create them
 * shipped with no caller anywhere in the product.
 */
export default async function ConductSetupPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ConductSetupContent />
    </div>
  );
}
