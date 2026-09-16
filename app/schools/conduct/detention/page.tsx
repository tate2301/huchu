import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ConductDetentionContent } from "@/components/schools/conduct/conduct-detention-content";
import { authOptions } from "@/lib/auth";

/** Detention — S-12.1, the register a supervisor marks standing up. */
export default async function SchoolsConductDetentionPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ConductDetentionContent />
    </div>
  );
}
