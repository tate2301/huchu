import { redirect } from "next/navigation";

export default async function CompanyFeaturesRoute({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  redirect(`/admin/company/${companyId}/commercial?view=features`);
}
