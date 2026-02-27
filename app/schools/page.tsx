import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { PageHeading } from "@/components/layout/page-heading";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authOptions } from "@/lib/auth";

export default async function SchoolsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading title="Schools" description="Module scaffold" />
      <Card>
        <CardHeader>
          <CardTitle>Schools module scaffold</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This route is gated and ready for schools feature wiring.
        </CardContent>
      </Card>
    </div>
  );
}
