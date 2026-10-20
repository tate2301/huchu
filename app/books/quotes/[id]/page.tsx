import { DocumentRecordContent } from "@/components/crm/documents/document-record-content";

/**
 * One quote, at its one address in Books (design/books/NOTES.md §2). `id` is
 * the CRM document's id. The quote record is not drawn in the Books design
 * yet (spec/open.md), so this is the CRM's record, unchanged in what it does,
 * in Books' panel: its back link and its siblings open Books addresses.
 */
export default async function BooksQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="band-stack-content mx-auto w-full space-y-6">
      <DocumentRecordContent documentId={id} kind="QUOTATION" />
    </div>
  );
}
