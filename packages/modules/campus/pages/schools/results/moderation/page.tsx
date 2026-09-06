import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";
import { ModerationQueueContent } from "../../../../components/results/moderation-queue-content";

export default async function SchoolsResultsModerationPage() {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ModerationQueueContent />
    </div>
  );
}
