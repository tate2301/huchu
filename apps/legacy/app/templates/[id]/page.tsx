import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { TemplateEditor } from "@/components/crm/templates/template-editor";
import { authOptions } from "@/lib/auth";

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <TemplateEditor templateId={id} />
    </div>
  );
}
