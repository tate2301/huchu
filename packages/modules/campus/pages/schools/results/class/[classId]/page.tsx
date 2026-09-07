import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { notFound, redirect } from "next/navigation";
import { ClassResultsContent } from "../../../../../components/results/class-results-content";
import { prisma } from "@corelithzw/db/client";

export default async function ClassResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ streamId?: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) {
    redirect("/login");
  }

  const { classId } = await params;
  const { streamId } = await searchParams;

  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, companyId: session.user.companyId },
    select: { id: true, name: true },
  });
  if (!schoolClass) notFound();

  // The heading lives inside the client component because its create button
  // needs a click handler, which cannot cross the server boundary — so the
  // year group's name is handed down rather than rendered here.
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ClassResultsContent
        classId={schoolClass.id}
        yearGroup={schoolClass.name}
        initialStreamId={streamId}
      />
    </div>
  );
}
