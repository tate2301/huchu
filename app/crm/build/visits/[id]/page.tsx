import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { VisitFormBuilder } from "@/components/crm/build/visit-form-builder";
import { authOptions } from "@/lib/auth";

/** Who may change the form is the API's to say; the builder shows its answer. */
export default async function VisitFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return <VisitFormBuilder id={id} />;
}
