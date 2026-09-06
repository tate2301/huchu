"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@corelithzw/react";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@corelithzw/ui/components/dropdown-menu";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Download, DotsThree, FileText } from "@corelithzw/ui/lib/icons";
import { useDebounced } from "@corelithzw/ui/hooks/use-debounced";
import { fetchCrmDocuments, type CrmDocumentKind, type CrmDocumentRecord } from "@/lib/crm/crm-v2";
import { DOCUMENT_STATUS } from "@/lib/crm/tones";

import {
  GroupedRecordList,
  bucketByDate,
  type RecordListSection,
} from "@corelithzw/module-records/components/record-list-groups";
import { RecordListPager } from "@corelithzw/module-records/components/record-list";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { formatMoney } from "./document-types";

const PAGE_SIZE = 50;

/** The accounting statuses, said the way a salesperson would say them. */
/**
 * Where the document came from, and therefore where its PDF lives — the
 * render route hangs off the record the document was raised against.
 */
function origin(document: CrmDocumentRecord) {
  if (document.deal) {
    return {
      href: `/crm/deals/${document.deal.id}`,
      label: document.deal.title,
      api: `/api/v2/crm/deals/${document.deal.id}`,
    };
  }
  if (document.lead) {
    return {
      href: `/crm/leads/${document.lead.id}`,
      label: document.lead.title,
      api: `/api/v2/crm/leads/${document.lead.id}`,
    };
  }
  return null;
}

export function DocumentsListContent({
  kind,
  title,
  searchPlaceholder,
  emptyBody,
}: {
  kind: CrmDocumentKind;
  title: string;
  searchPlaceholder: string;
  emptyBody: string;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounced(search, 300);

  const documentsQuery = useQuery({
    queryKey: ["crm", "documents", kind, debouncedSearch, page],
    queryFn: () =>
      fetchCrmDocuments({ type: kind, q: debouncedSearch, page, limit: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  });

  const documents = useMemo(() => documentsQuery.data?.data ?? [], [documentsQuery.data]);
  const total = documentsQuery.data?.pagination?.total ?? documents.length;

  const sections = useMemo<RecordListSection[]>(() => {
    // Grouped by when it was issued, because that is how anybody looks for a
    // quote: "the one we sent last week".
    const buckets = bucketByDate(documents, (document) => document.issuedAt);
    return buckets.map((bucket) => ({
      id: bucket.id,
      label: bucket.label,
      // Today and Yesterday earn their heading even when empty; the rest do
      // not, per the recipe.
      alwaysShow: bucket.id === "today" || bucket.id === "yesterday",
      emptyBody: `Nothing ${bucket.label.toLowerCase()}.`,
      rows: bucket.items.map((document) => {
        const from = origin(document);
        const status = DOCUMENT_STATUS[document.status] ?? {
          label: document.status,
          tone: "neutral" as const,
        };

        return {
          id: document.id,
          href: from?.href ?? "/crm/deals",
          title: (
            <span className="font-mono">{document.number ?? "—"}</span>
          ),
          subtitle: (
            <>
              {document.customer ?? from?.label ?? "No customer on record"}
              {" · "}
              <ClientDate value={document.issuedAt} mode="date" />
              {document.version > 1 ? ` · v${document.version}` : ""}
            </>
          ),
          status: (
            <>
              <Badge tone={status.tone} size="sm">
                {status.label}
              </Badge>
              {document.approvalStatus === "APPROVED" ? (
                <Badge tone="success" size="sm">
                  Approved
                </Badge>
              ) : null}
            </>
          ),
          facts: [
            ...(document.balance !== null && document.balance > 0
              ? [
                  {
                    label: "Outstanding",
                    value: formatMoney(document.balance, document.currency),
                    mono: true,
                  },
                ]
              : []),
            {
              label: "Total",
              // The figure a phone keeps: what the document is for.
              primary: true,
              value: formatMoney(document.total, document.currency),
              mono: true,
            },
          ],
          actions: from ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-label={`Actions for ${document.number ?? "this document"}`}
                >
                  <DotsThree />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a
                    href={`${from.api}/documents/${document.id}/pdf`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2"
                  >
                    <FileText className="h-4 w-4" />
                    View PDF
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a
                    href={`${from.api}/documents/${document.id}/pdf?download=1`}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null,
        };
      }),
    }));
  }, [documents]);

  return (
    <RecordListShell
      width="narrow"
      title={title}
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        setPage(1);
      }}
      searchPlaceholder={searchPlaceholder}
      error={documentsQuery.error}
    >
      <GroupedRecordList
        sections={sections}
        isLoading={documentsQuery.isLoading}
        emptyTitle={debouncedSearch ? `Nothing matches “${debouncedSearch}”` : `No ${title.toLowerCase()} yet`}
        emptyBody={debouncedSearch ? undefined : emptyBody}
      />

      <RecordListPager page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
    </RecordListShell>
  );
}
