"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { FilterSelect } from "../common/filter-select";
import {
  LoadError,
  NothingMatched,
  NothingYet,
  SaveError,
  TableRowsSkeleton,
} from "../common/states";
import { useSchoolAccess } from "../common/use-school-access";
import { whoCan, type SchoolResource } from "../../access";
import { fetchJson } from "@corelithzw/platform/api-client";
import { formatSchoolDate } from "../../format";

/**
 * The paperwork that belongs with a school record, with a way to put it there.
 *
 * `components/records/subject-tabs.tsx` renders these read-only across the
 * whole product, so every campus record had a Files tab that could only ever
 * be empty — a birth certificate arrived at the office and had nowhere to go.
 *
 * Two calls, in this order, because they fail differently: the blob upload
 * first, then the row that points at it. An upload with no row leaves a file
 * nobody can see; a row with no upload leaves a link to nothing, which is the
 * worse of the two.
 */

export type RecordFile = {
  id: string;
  name: string;
  url: string;
  size: number | null;
  contentType: string | null;
  note: string | null;
  createdAt: string;
  uploadedBy: { id: string; name: string | null } | null;
};

/**
 * What a school actually looks for in here: the scan of something, or the PDF
 * somebody typed. Two kinds, because that is how many the upload accepts.
 */
const KIND_OPTIONS = [
  { value: "image", label: "Scans and photos" },
  { value: "pdf", label: "PDFs" },
];

function sizeLabel(bytes: number | null) {
  if (bytes === null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RecordFilesTab({
  subjectType,
  subjectId,
  files,
  isPending,
  error,
  onRetry,
  resource,
}: {
  /** `STUDENT`, `GUARDIAN`, `TEACHER` — a `SchoolRecordType`. */
  subjectType: string;
  subjectId: string;
  files: RecordFile[];
  isPending: boolean;
  /**
   * The read that failed, from the caller's query. The tab does not fetch its
   * own rows — the record page already has them for the tab's count — so the
   * fault has to travel down with them, or the tab reports "nothing attached"
   * for a record whose paperwork simply would not load.
   */
  error?: unknown;
  onRetry?: () => void;
  /** Whose grant decides whether anything may be attached. */
  resource: SchoolResource;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [kind, setKind] = useState("");
  const access = useSchoolAccess();

  const permitted = access.can(resource, "edit");
  const who = permitted ? null : whoCan(resource, "edit");
  const reason = permitted
    ? undefined
    : who
      ? `This is ${who} to do.`
      : "Attaching paperwork is somebody else's job.";

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData();
      body.set("context", "school-document");
      body.set("file", file);
      const uploaded = await fetchJson<{ url: string; contentType: string; size: number }>(
        "/api/uploads",
        { method: "POST", body },
      );
      return fetchJson<RecordFile>("/api/v2/records/files", {
        method: "POST",
        body: JSON.stringify({
          subjectType,
          subjectId,
          name: file.name,
          url: uploaded.url,
          size: uploaded.size,
          contentType: uploaded.contentType,
        }),
      });
    },
    onSuccess: () => {
      setSaveError(null);
      void queryClient.invalidateQueries({
        queryKey: ["records", "files", subjectType, subjectId],
      });
    },
    onError: (cause) => setSaveError(cause),
    onSettled: () => {
      if (input.current) input.current.value = "";
    },
  });

  const visible = files.filter((file) => {
    if (kind === "image") return (file.contentType ?? "").startsWith("image/");
    if (kind === "pdf") return (file.contentType ?? "").includes("pdf");
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-muted)]">
          Anything that arrived on paper — a birth certificate, a transfer letter, a
          medical consent. Images and PDFs up to 10&nbsp;MB.
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={Boolean(reason)}
          loading={upload.isPending}
          title={reason}
          onClick={() => input.current?.click()}
        >
          {upload.isPending ? "Attaching…" : "Attach a file"}
        </Button>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload.mutate(file);
          }}
        />
      </div>

      {saveError ? <SaveError what="That file" error={saveError} /> : null}

      {isPending ? (
        <TableRowsSkeleton
          headers={["Document", "Size"]}
          columns={[{ twoLine: true }, { width: 90, align: "right" }]}
          rows={3}
        />
      ) : error ? (
        <LoadError what="this record's paperwork" error={error} onRetry={onRetry} />
      ) : files.length === 0 ? (
        <NothingYet
          title="Nothing attached"
          body="A birth certificate, a transfer letter, a medical note — anything that arrived on paper and belongs with this record."
        />
      ) : (
        <div className="space-y-3">
          {/* A record with two documents does not need narrowing; one with a
              term's worth of medical notes does. */}
          {files.length > 3 ? (
            <FilterSelect
              label="Kind"
              allLabel="Everything attached"
              value={kind}
              options={KIND_OPTIONS}
              onChange={setKind}
            />
          ) : null}

          {visible.length === 0 ? (
            <NothingMatched
              what="documents"
              filters={[KIND_OPTIONS.find((option) => option.value === kind)?.label ?? ""].filter(
                Boolean,
              )}
              onClear={() => setKind("")}
            />
          ) : (
            <ul className="space-y-2">
              {visible.map((file, index) => (
                <li
                  key={file.id}
                  className="campus-row-in"
                  style={{ animationDelay: `${index * 40}ms` }}
                >
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-sm)] p-3 hover:bg-[var(--surface-hover)]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--text-strong)]">
                        {file.name}
                      </span>
                      <span className="block truncate text-sm text-[var(--text-muted)]">
                        {[
                          file.uploadedBy?.name ?? "Somebody",
                          formatSchoolDate(file.createdAt),
                          sizeLabel(file.size),
                          file.note,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
