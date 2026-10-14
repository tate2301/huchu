import { UrlToolbar } from "@/components/admin/list-controls";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { PeopleTable } from "@/components/admin/people/people-table";
import { findPeople } from "@/lib/admin/people";

export const metadata = { title: "People · Corelith admin" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const rows = await findPeople(q);
  return (
    <AdminPage>
      <AdminPageHeader title="People" />
      <UrlToolbar
        searchPlaceholder="Name, email or phone"
        count={q.trim().length >= 2 ? `${rows.length} ${rows.length === 1 ? "person" : "people"}` : undefined}
      />
      <PeopleTable
        rows={rows}
        emptyTitle={q.trim().length >= 2 ? `Nobody matches “${q.trim()}”` : "Type a name, an email or a phone number to find someone in any workspace"}
      />
    </AdminPage>
  );
}
