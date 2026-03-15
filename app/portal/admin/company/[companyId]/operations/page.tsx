import { redirect } from "next/navigation";

export default async function CompanyOperationsRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  redirect(`/admin/company/${companyId}/advanced`);
}
