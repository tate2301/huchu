import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PublishingContent } from "@corelithzw/module-campus/components/results/publishing-content";
import { authOptions } from "@/lib/auth";

export default async function SchoolsResultsPublishPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PublishingContent />
    </div>
  );
}
