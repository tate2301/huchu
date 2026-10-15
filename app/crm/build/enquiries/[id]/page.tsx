import { redirect } from "next/navigation";

/**
 * An enquiry form's builder is Build's form builder now, keeping the id. The
 * enquiries sent with it are listed in its Settings, each opening its lead.
 */
export default async function EnquiryFormBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/build/forms/${encodeURIComponent(id)}`);
}
