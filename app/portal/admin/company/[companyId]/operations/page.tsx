import { AdminShell } from "@/components/admin-portal/shell/admin-shell";
import { OperationsPage } from "@/components/admin-portal/pages/operations-page";
import { requireAdminPortalSession } from "@/lib/admin-portal/server";

export default async function CompanyOperationsRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const session = await requireAdminPortalSession();

  return (
    <AdminShell activeCompanyId={companyId}>
      <OperationsPage
        title="Organization operations"
        actorEmail={session.user.email ?? "superuser"}
        companyId={companyId}
        modules={["org", "site", "subscription", "feature", "admin", "user", "audit", "support", "runbook", "health", "contract", "search"]}
      />
    </AdminShell>
  );
}
