import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";

export default async function SchoolsResultsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading
        title="Schools Results"
        description="Continuous assessment, exams, moderation, and publish scaffold"
      />
      <Card>
        <CardHeader>
          <CardTitle>Results engine scaffold</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This route is gated and ready for teacher, HOD, and admin moderation workflows.
        </CardContent>
      </Card>
    </div>
  );
}
