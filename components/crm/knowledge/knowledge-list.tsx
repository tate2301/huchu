"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Badge, Button, Input } from "@corelithzw/react";
import { RecordDialog } from "@/components/crm/records/record-dialog";
import { RecordListShell } from "@/components/crm/records/record-list-shell";
import { GroupedRecordList, type RecordListSection } from "@/components/records/record-list-groups";
import { ClientDate } from "@/components/ui/client-date";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { KnowledgeRow } from "@/lib/crm/knowledge/store";
import { Upload } from "@/lib/icons";

export const KNOWLEDGE_QUERY_KEY = ["crm", "knowledge"] as const;

const ACCEPT = ".pdf,.docx,.xlsx,.csv,.txt,.md";

const holds = (row: KnowledgeRow) =>
  [
    row.prices ? `${row.prices} ${row.prices === 1 ? "price" : "prices"}` : null,
    row.pages ? `${row.pages} ${row.pages === 1 ? "page" : "pages"}` : null,
  ]
    .filter(Boolean)
    .join(" · ") || "Words only";

/**
 * CRM → Knowledge: the price lists, rate cards, product sheets and terms the
 * business uploaded, so Vane answers and quotes from them. Price lists first,
 * then the rest; one with prices Vane found waiting to be kept says so.
 */
export function KnowledgeList() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const knowledge = useQuery({
    queryKey: KNOWLEDGE_QUERY_KEY,
    queryFn: () => fetchJson<{ data: KnowledgeRow[]; canEdit: boolean }>("/api/v2/crm/knowledge"),
  });
  const rows = useMemo(() => knowledge.data?.data ?? [], [knowledge.data]);
  const canEdit = knowledge.data?.canEdit ?? false;

  const upload = useMutation({
    mutationFn: () => {
      const body = new FormData();
      body.append("file", file!);
      body.append("title", title.trim());
      return fetchJson<{ id: string }>("/api/v2/crm/knowledge", { method: "POST", body });
    },
    onSuccess: async (doc) => {
      await queryClient.invalidateQueries({ queryKey: KNOWLEDGE_QUERY_KEY });
      close();
      router.push(`/crm/knowledge/${doc.id}`);
    },
    onError: (error) => setErrors([getApiErrorMessage(error, "It did not upload. Try again.")]),
  });

  const close = () => {
    setUploading(false);
    setFile(null);
    setTitle("");
    setErrors([]);
  };

  const sections = useMemo<RecordListSection[]>(() => {
    const needle = search.trim().toLowerCase();
    const shown = needle ? rows.filter((row) => `${row.title} ${row.fileName}`.toLowerCase().includes(needle)) : rows;
    const toRow = (row: KnowledgeRow) => ({
      id: row.id,
      href: `/crm/knowledge/${row.id}`,
      title: row.title,
      subtitle: (
        <>
          {row.fileName}
          {" · "}
          <ClientDate value={row.createdAt} mode="date" />
          {row.uploadedBy ? ` · ${row.uploadedBy}` : ""}
        </>
      ),
      status: row.waiting ? (
        <Badge tone="warn" size="sm">
          {row.waiting} {row.waiting === 1 ? "price" : "prices"} to keep
        </Badge>
      ) : null,
      facts: [{ label: "Holds", value: holds(row), primary: true }],
    });
    return [
      { id: "prices", label: "Price lists", rows: shown.filter((row) => row.kind === "PRICE_LIST").map(toRow) },
      { id: "documents", label: "Documents", rows: shown.filter((row) => row.kind === "DOCUMENT").map(toRow) },
    ];
  }, [rows, search]);

  return (
    <RecordListShell
      width="narrow"
      title="Knowledge"
      search={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by title or file"
      createLabel={canEdit ? "Upload" : undefined}
      onCreate={canEdit ? () => setUploading(true) : undefined}
      error={knowledge.error}
    >
      <GroupedRecordList
        sections={sections}
        isLoading={knowledge.isLoading}
        emptyTitle={search ? `Nothing matches “${search}”` : "Nothing in the knowledge base yet"}
        emptyBody={
          search
            ? undefined
            : canEdit
              ? "Upload your price list, rate card, product sheets or terms. Vane answers from them and drafts quotes priced from them."
              : "Someone who can change CRM settings uploads the price lists and documents Vane quotes from."
        }
      />

      <RecordDialog
        open={uploading}
        onOpenChange={(open) => (open ? setUploading(true) : close())}
        title="Add to the knowledge base"
        description="A price list, rate card, product sheet or terms. It stays inside the business: Vane reads it, clients never see it."
        errors={errors}
        onSubmit={(event) => {
          event.preventDefault();
          if (!file) return setErrors(["Choose a file to upload."]);
          setErrors([]);
          upload.mutate();
        }}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={upload.isPending}>
              Upload
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label="The file"
              onChange={(event) => {
                const chosen = event.target.files?.[0] ?? null;
                setFile(chosen);
                if (chosen && !title) setTitle(chosen.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim());
              }}
            />
            <Button type="button" variant="secondary" startIcon={<Upload aria-hidden="true" className="size-4" />} onClick={() => fileInput.current?.click()}>
              {file ? "Choose a different file" : "Choose a file"}
            </Button>
            <p className="text-sm text-[var(--text-muted)]">
              {file ? file.name : "A spreadsheet (.xlsx, .csv) is read row by row for its prices. A PDF, Word document or text file is read for its words; Vane can then find its prices. Up to 20MB."}
            </p>
          </div>
          <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Rate card 2026" maxLength={200} />
        </div>
      </RecordDialog>
    </RecordListShell>
  );
}
