import { redirect } from "next/navigation";

/** Templates are global, not a CRM feature. They live at the sidebar root. */
export default async function CrmTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/templates/${id}`);
}
