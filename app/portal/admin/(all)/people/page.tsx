import { Suspense } from "react";

import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";

export const metadata = { title: "People · Corelith admin" };

export default function PeoplePage() {
  return (
    <AdminPage>
      <AdminPageHeader title="People" />
      <Suspense>
        <AdminList source="admin-people" title="People" />
      </Suspense>
    </AdminPage>
  );
}
