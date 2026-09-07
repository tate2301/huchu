import { redirect } from "next/navigation";

export default async function CompanyDashboardRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  redirect(`/admin/clients/${companyId}`);
}
