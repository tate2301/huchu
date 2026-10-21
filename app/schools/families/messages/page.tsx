import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { OfficeInboxContent } from "@/components/schools/messages/office-inbox-content";
import { authOptions } from "@/lib/auth";

/**
 * The office's inbox.
 *
 * `allThreads()` and `closeThread()` have been built, tested and exposed at
 * `/api/v2/schools/messages` since messaging landed, and nothing rendered them.
 * A conversation a parent addressed to the school rather than to a named
 * teacher therefore arrived on a queue no person could open.
 */
export default async function SchoolsMessagesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageChrome
        title="Messages"
      />
      <OfficeInboxContent />
    </div>
  );
}
