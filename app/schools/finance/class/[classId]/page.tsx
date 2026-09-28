import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { PageChrome } from "@/components/layout/page-chrome";
import { ClassFeesContent } from "@/components/schools/fees/class-fees-content";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function ClassFeesPage({
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
    select: {
      id: true,
      name: true,
    },
  });
  if (!schoolClass) notFound();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <PageChrome title={`${schoolClass.name} fees`} />
      <ClassFeesContent classId={schoolClass.id} initialStreamId={streamId} />
    </div>
  );
}
