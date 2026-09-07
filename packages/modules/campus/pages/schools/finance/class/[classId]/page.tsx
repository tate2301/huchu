import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { notFound, redirect } from "next/navigation";

import { PageHeading } from "@corelithzw/ui/layout/page-heading";
import { ClassFeesContent } from "../../../../../components/fees/class-fees-content";
import { prisma } from "@corelithzw/db/client";

export default async function ClassFeesPage({
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
    select: {
      id: true,
      name: true,
      _count: { select: { students: true } },
    },
  });
  if (!schoolClass) notFound();

  const pupils = schoolClass._count.students;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      {/* The caption is the size of the room, not a restatement of the title:
          "118 pupils" is what tells a bursar whether 31 families owing is most
          of the form or a handful of it. */}
      <PageHeading
        title={`${schoolClass.name} fees`}
        description={`${pupils} ${pupils === 1 ? "pupil" : "pupils"}`}
      />
      <ClassFeesContent classId={schoolClass.id} initialStreamId={streamId} />
    </div>
  );
}
