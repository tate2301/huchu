import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { ClassStudentsContent } from "@corelithzw/module-campus/components/students/class-students-content";
import { authOptions } from "@/lib/auth";
import { prisma } from "@corelithzw/db/client";

export default async function ClassStudentsPage({
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

  // Resolved here so the heading names the year group on first paint rather
  // than saying "Students" until a client fetch lands, and so a class from
  // another tenant is a 404 rather than an empty list.
  const schoolClass = await prisma.schoolClass.findFirst({
    where: { id: classId, companyId: session.user.companyId },
    select: { id: true, name: true },
  });
  if (!schoolClass) notFound();

  // The caption carries the term because that is the thing about this page
  // that changes; the year group's name never does, and it is already the
  // title. No term running is a school between terms, and the caption simply
  // drops the half it cannot fill.
  const term = await prisma.schoolTerm.findFirst({
    where: { companyId: session.user.companyId, isActive: true },
    select: { name: true },
    orderBy: { startDate: "desc" },
  });

  return (
    // The heading is inside the content component: its one primary action adds
    // a pupil, and the dialog behind that verb is state a server file cannot hold.
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <ClassStudentsContent
        classId={schoolClass.id}
        className={schoolClass.name}
        initialStreamId={streamId}
        termName={term?.name}
      />
    </div>
  );
}
