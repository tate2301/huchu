import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { AdminList } from "@/components/admin/lists/admin-list";
import { AdminPage, AdminPageHeader } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import { Plus } from "@/lib/icons";

export const metadata = { title: "Operators · Corelith admin" };

/** Owners only: for everyone else the page does not exist, as the sidebar says. */
export default async function OperatorsPage() {
  const operator = await requireOperator();
  if (!operatorCan(operator.role, "operator.manage")) notFound();
  return (
    <AdminPage>
      <AdminPageHeader
        title="Operators"
        actions={
          <Link href="/admin/operators?sheet=operator-invite" scroll={false} className="btn btn-primary no-underline">
            <Plus aria-hidden="true" />
            Invite an operator
          </Link>
        }
      />
      <Suspense>
        <AdminList source="admin-operators" title="Operators" />
      </Suspense>
    </AdminPage>
  );
}
