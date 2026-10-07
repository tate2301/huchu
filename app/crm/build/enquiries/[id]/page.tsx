import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { EnquiryFormBuilder } from "@/components/crm/build/enquiry-form-builder";
import { authOptions } from "@/lib/auth";

export default async function EnquiryFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  return <EnquiryFormBuilder id={id} />;
}
