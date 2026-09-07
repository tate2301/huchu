import { getCurrentAuthSession } from "@corelithzw/platform/auth-core/session";
import { redirect } from "next/navigation";

import { TemplateEditor } from "../../../components/templates/template-editor";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getCurrentAuthSession();
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <TemplateEditor templateId={id} />
    </div>
  );
}
