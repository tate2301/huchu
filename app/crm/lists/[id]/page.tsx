import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { CrmPage } from "@/components/crm/crm-page";
import { ListDetailPage } from "@/components/crm/records/list-detail-page";
import { authOptions } from "@/lib/auth";
import { groupHref } from "@/lib/crm/groups";
import { prisma } from "@/lib/prisma";

/**
 * A group. A group opens as its record type's list narrowed to the group —
 * searchable, sortable and exportable like any other slice — so this page
 * only draws groups of jobs, which are not on the list engine yet.
 */
export default async function CrmListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  const group = await prisma.crmList.findFirst({
    where: {
      id,
      companyId: session.user.companyId,
      OR: [{ isShared: true }, { createdById: session.user.id }],
    },
    select: { id: true, entity: true },
  });
  if (!group) notFound();

  const href = groupHref(group.entity, group.id);
  if (!href.startsWith("/crm/lists/")) redirect(href);

  return (
    <CrmPage>
      <ListDetailPage listId={id} />
    </CrmPage>
  );
}
