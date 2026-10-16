import { notFound } from "next/navigation";

import { workspaceLibraryItem } from "@/lib/library/workspace";

import { LibraryDocumentView, LibraryEnquiryFormView, LibraryLayoutView, LibraryVisitFormView } from "./library-views";

/**
 * One of Corelith's library at a Build address, read for this workspace and
 * opened read-only in its kind's builder. Server-only; the Build pages route
 * here once `findBuildRecord` has said the address is one.
 */
export async function LibraryRecord({ companyId, libraryKey, role }: { companyId: string; libraryKey: string; role: string }) {
  const found = await workspaceLibraryItem(companyId, libraryKey);
  if (!found) notFound();
  // Starting a copy is a manager's, as Build's own Use this template is.
  const canUse = role === "SUPERADMIN" || role === "MANAGER";
  const { key, title, summary } = found.entry;
  const item = { key, title, summary };
  switch (found.kind) {
    case "VISIT_FORM":
      return <LibraryVisitFormView item={{ ...item, payload: found.entry.payload }} canUse={canUse} />;
    case "ENQUIRY_FORM":
      return <LibraryEnquiryFormView item={{ ...item, payload: found.entry.payload }} canUse={canUse} />;
    case "BLOCK_TEMPLATE":
      return <LibraryDocumentView item={{ ...item, payload: found.entry.payload }} canUse={canUse} />;
    case "LAYOUT":
      return <LibraryLayoutView item={{ ...item, payload: found.entry.payload }} canUse={canUse} />;
  }
}
