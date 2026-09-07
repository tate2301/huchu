import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { OfficeInboxContent } from "../../../components/messages/office-inbox-content";

/**
 * The office's inbox.
 *
 * `allThreads()` and `closeThread()` have been built, tested and exposed at
 * `/api/v2/schools/messages` since messaging landed, and nothing rendered them.
 * A conversation a parent addressed to the school rather than to a named
 * teacher therefore arrived on a queue no person could open.
 */
export default async function SchoolsMessagesPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageHeading
        title="Messages"
        description="Every conversation between a family and the school — and the ones nobody has picked up yet."
      />
      <OfficeInboxContent />
    </div>
  );
}
