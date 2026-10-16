import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { BuilderRefused } from "@/components/build/builder-states";
import { LibraryRecord } from "@/components/build/library-record";
import { DocumentBuilder } from "@/components/build/document-builder";
import { EnquiryFormBuilder } from "@/components/build/enquiry-form-builder";
import { VisitFormBuilder } from "@/components/build/visit-form-builder";
import { authOptions } from "@/lib/auth";
import { buildHref } from "@/lib/build/items";
import { findBuildRecord, recordHref, recordProvisioned } from "@/lib/build/read";

/**
 * A form in Build (BuildForm, PageIntakeForm), on the builder's grid: a
 * site-visit form, an enquiry form, or a form laid out as blocks. Anything
 * else at this address opens in its own builder; a form this workspace is not
 * provisioned for is refused here as well as in the panel.
 */
export default async function BuildFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const user = session.user as { companyId: string; role: string; enabledFeatures?: string[] };
  const record = await findBuildRecord(user.companyId, id);
  if (!record) notFound();
  if (!recordProvisioned(record, user.enabledFeatures)) return <BuilderRefused what="the CRM" backHref="/build?kind=forms" />;
  if (record.source === "library") {
    // Corelith's, read-only, in the builder its kind opens in.
    if (recordHref(record) !== `/build/forms/${encodeURIComponent(id)}`) redirect(recordHref(record));
    return <LibraryRecord companyId={user.companyId} libraryKey={record.id} role={user.role} />;
  }
  if (record.source === "visit") return <VisitFormBuilder id={id} />;
  if (record.source === "enquiry") return <EnquiryFormBuilder id={id} />;
  if (record.source === "block" && record.kind === "FORM") return <DocumentBuilder id={id} />;
  if (record.source === "block") redirect(buildHref("block", id, record.kind));
  if (record.source === "report") redirect(buildHref("report", id));
  redirect(`/build/templates/${encodeURIComponent(id)}`);
}
