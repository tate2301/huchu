import { notFound } from "next/navigation";

import { OperatorsTable } from "@/components/admin/operators/operators-table";
import { AdminPage } from "@/components/admin/page-header";
import { requireOperator } from "@/lib/operators/guards";
import { listOperators } from "@/lib/operators/manage";
import { operatorCan } from "@/lib/operators/roles";

import { changeRole, invite, newInvite, remove, resetTheirAuthenticator } from "./actions";

export const metadata = { title: "Operators · Corelith admin" };

/** Owners only: for everyone else the page does not exist, as the sidebar says. */
export default async function OperatorsPage() {
  const operator = await requireOperator();
  if (!operatorCan(operator.role, "operator.manage")) notFound();
  const rows = await listOperators();
  return (
    <AdminPage>
      <OperatorsTable
        rows={rows}
        selfId={operator.id}
        actions={{ invite, newInvite, resetAuthenticator: resetTheirAuthenticator, changeRole, remove }}
      />
    </AdminPage>
  );
}
