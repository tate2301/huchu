import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ConductLogContent } from "@/components/schools/conduct/conduct-log-content";
import { authOptions } from "@/lib/auth";

/**
 * The behaviour log — S-12.1.
 *
 * The heading and its one primary action are registered from inside the content
 * component: `Log an incident` opens a dialog on state a server file cannot
 * hold, and the band chips are counts the client refetches after every write.
 */
export default async function SchoolsConductPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ConductLogContent />
    </div>
  );
}
