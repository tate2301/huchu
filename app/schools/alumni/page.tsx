import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AlumniContent } from "@/components/schools/leavers/alumni-content";
import { authOptions } from "@/lib/auth";

/** The alumni register — S-13.5. */
export default async function SchoolsAlumniPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <AlumniContent />
    </div>
  );
}
