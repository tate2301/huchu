import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { ClassAssessmentsContent } from "@/components/schools/assessments/class-assessments-content";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The work a class has been set, and the marks on it.
 *
 * `ClassAssessmentsContent` is the office's mark-entry screen — a thousand
 * lines with a mark sheet, a term-marks view and the button that writes those
 * onto the result sheet the school moderates. It shipped with no route file and
 * no importer anywhere, so the only place in the product a mark could be
 * entered was the teacher's own portal. When a teacher is away, somebody still
 * has to enter the marks, and until now there was nowhere for them to do it.
 *
 * It sits under the class's marks rather than in the rail because it is about
 * one class and is reached from that class.
 */
export default async function ClassAssessmentsPage({
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
    select: { id: true },
  });
  if (!schoolClass) notFound();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ClassAssessmentsContent classId={schoolClass.id} initialStreamId={streamId} />
    </div>
  );
}
