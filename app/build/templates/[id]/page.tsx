import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { BuilderRefused } from "@/components/build/builder-states";
import { LibraryRecord } from "@/components/build/library-record";
import { DocumentBuilder } from "@/components/build/document-builder";
import { LayoutBuilder } from "@/components/build/layout-builder";
import { authOptions } from "@/lib/auth";
import { buildHref } from "@/lib/build/items";
import { layoutUser } from "@/lib/build/provision";
import { findBuildRecord, recordHref, recordProvisioned } from "@/lib/build/read";

const MODULE_NAME = { books: "Books", payroll: "payroll", schools: "a school", retail: "Tender", crm: "the CRM", reports: "these reports" } as const;

/**
 * A template in Build (PageTemplateEmail, PageTemplatePayslip): an email laid
 * out as blocks, or a printed layout — the workspace's own, or Corelith's
 * (by its key, read-only, with Use this template). A layout whose module the
 * workspace does not run is refused: no payroll, no payslip.
 */
export default async function BuildTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const user = session.user as { companyId: string; role: string; enabledFeatures?: string[] };
  const key = decodeURIComponent(id);
  const record = await findBuildRecord(user.companyId, key);
  if (!record) notFound();
  if (!recordProvisioned(record, user.enabledFeatures)) {
    const what =
      record.source === "layout" || record.source === "catalog" || (record.source === "library" && record.kind === "LAYOUT")
        ? MODULE_NAME[layoutUser(record.sourceKey ?? "")]
        : "the CRM";
    return <BuilderRefused what={what} backHref="/build/templates" />;
  }
  if (record.source === "library") {
    // Corelith's, read-only, in the builder its kind opens in.
    if (recordHref(record) !== `/build/templates/${encodeURIComponent(key)}`) redirect(recordHref(record));
    return <LibraryRecord companyId={user.companyId} libraryKey={record.id} role={user.role} />;
  }
  if (record.source === "layout" || record.source === "catalog") return <LayoutBuilder id={record.id} />;
  if (record.source === "block" && record.kind === "EMAIL") return <DocumentBuilder id={record.id} backLabel="Back" />;
  if (record.source === "block") redirect(buildHref("block", record.id, record.kind));
  if (record.source === "report") redirect(buildHref("report", record.id));
  redirect(buildHref(record.source, record.id));
}
