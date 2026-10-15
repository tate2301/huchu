import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { BuilderRefused } from "@/components/build/builder-states";
import { DocumentBuilder } from "@/components/build/document-builder";
import { authOptions } from "@/lib/auth";
import { buildHref } from "@/lib/build/items";
import { findBuildRecord, recordProvisioned } from "@/lib/build/read";

/**
 * A document in Build (BuildDocument): a quote, an invoice, a receipt or a
 * table export laid out as blocks, on the builder's grid — the rebuild of
 * `/templates/[id]`. Anything else at this address opens in its own builder.
 */
export default async function BuildDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const user = session.user as { companyId: string; enabledFeatures?: string[] };
  const record = await findBuildRecord(user.companyId, id);
  if (!record) notFound();
  if (!recordProvisioned(record, user.enabledFeatures)) return <BuilderRefused what="the CRM's documents" backHref="/build?kind=documents" />;
  if (record.source === "block" && record.kind !== "FORM" && record.kind !== "EMAIL") return <DocumentBuilder id={id} />;
  if (record.source === "block") redirect(buildHref("block", id, record.kind));
  if (record.source === "visit" || record.source === "enquiry") redirect(buildHref(record.source, id));
  if (record.source === "report") redirect(buildHref("report", id));
  redirect(`/build/templates/${encodeURIComponent(id)}`);
}
