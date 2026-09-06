import { getServerSession } from "next-auth";
import { CrmPage } from "@corelithzw/module-crm/components/crm-page";
import { redirect } from "next/navigation";
import { CrmFormBuilderContent } from "@corelithzw/module-crm/components/crm-form-builder-content";
import { authOptions } from "@/lib/auth";

export default async function CrmFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage width="detail">
      <CrmFormBuilderContent formId={id} />
    </CrmPage>
  );
}
