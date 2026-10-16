import { notFound } from "next/navigation";

import { LibraryEditor } from "@/components/admin/library/library-editor";
import { AdminPage } from "@/components/admin/page-header";
import { EMPTY_PAYLOAD, kindFromSlug, LIBRARY_KINDS } from "@/lib/library/kinds";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { prisma } from "@/lib/prisma";

/** One library item, or a new one (`/admin/library/<kind>/new`), in its kind's builder. */
export default async function LibraryItemPage({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: slug, id } = await params;
  const kind = kindFromSlug(slug);
  if (!kind) notFound();
  const operator = await requireOperator();
  const item =
    id === "new"
      ? null
      : await prisma.libraryItem.findFirst({
          where: { id, kind },
          select: {
            id: true,
            key: true,
            title: true,
            summary: true,
            payload: true,
            status: true,
            audience: true,
            verticals: true,
            publishedAt: true,
            workspaces: { select: { company: { select: { id: true, name: true, slug: true } } } },
          },
        });
  if (id !== "new" && !item) notFound();

  return (
    <AdminPage>
      <LibraryEditor
        kind={kind}
        canManage={operatorCan(operator.role, "library.manage")}
        item={
          item
            ? {
                id: item.id,
                key: item.key,
                title: item.title,
                summary: item.summary,
                payload: item.payload,
                status: item.status,
                reach: {
                  audience: item.audience,
                  verticals: item.verticals,
                  workspaces: item.workspaces.map((row) => row.company),
                },
              }
            : { id: null, key: "", title: "", summary: null, payload: EMPTY_PAYLOAD[kind], status: "DRAFT", reach: { audience: "EVERYONE", verticals: [], workspaces: [] } }
        }
        label={LIBRARY_KINDS[kind].label}
        foundIn={LIBRARY_KINDS[kind].foundIn}
      />
    </AdminPage>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: slug, id } = await params;
  const kind = kindFromSlug(slug);
  const item = id !== "new" ? await prisma.libraryItem.findUnique({ where: { id }, select: { title: true } }) : null;
  return { title: `${item?.title ?? `New ${kind ? LIBRARY_KINDS[kind].label.toLowerCase() : "item"}`} · Library · Corelith admin` };
}
