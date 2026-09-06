import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { SchoolsNoticesContent } from "../../../components/notices/schools-notices-content";

/**
 * What the school has told people.
 *
 * The heading and the send verb are inside the client component: the one
 * primary action here opens the compose dialog, and a heading in this file
 * could not reach the state that dialog runs on.
 */
export default async function SchoolsNoticesPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <SchoolsNoticesContent />
    </div>
  );
}
