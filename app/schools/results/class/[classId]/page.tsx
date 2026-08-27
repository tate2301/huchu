import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { ClassResultsContent } from "@/components/schools/results/class-results-content";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ClassResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ streamId?: string }>;
}) {
  const session = await getServerSession(authOptions);
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
