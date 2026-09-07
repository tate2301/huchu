import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { CrmPage } from "../../../../components/crm-page";
import { redirect } from "next/navigation";
import { CrmFormBuilderContent } from "../../../../components/crm-form-builder-content";

export default async function CrmFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return (
    <CrmPage width="detail">
      <CrmFormBuilderContent formId={id} />
    </CrmPage>
  );
}
