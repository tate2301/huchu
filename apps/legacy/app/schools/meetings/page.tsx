import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { MeetingsAdminContent } from "@corelithzw/module-campus/components/meetings/meetings-admin-content";
import { authOptions } from "@/lib/auth";

/**
 * The term's parents' evenings.
 *
 * No heading in this file: the page is named once, in the app bar, and the one
 * primary action — opening a teacher's evening — sits beside that name. Both
 * are registered by the client component, which is the only thing that can
 * reach the dialog the action opens.
 */
export default async function SchoolsMeetingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <MeetingsAdminContent />
    </div>
  );
}
