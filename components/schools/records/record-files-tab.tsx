"use client";

import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@corelithzw/react";

import { NothingYet, SaveError, TableRowsSkeleton } from "@/components/schools/common/states";
import { useSchoolAccess } from "@/components/schools/common/use-school-access";
import { whoCan, type SchoolResource } from "@/lib/schools/access";
import { fetchJson } from "@/lib/api-client";
import { formatSchoolDate } from "@/lib/schools/format";

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
  resource,
}: {
  /** `STUDENT`, `GUARDIAN`, `TEACHER` — a `SchoolRecordType`. */
  subjectType: string;
  subjectId: string;
  files: RecordFile[];
  isPending: boolean;
  /** Whose grant decides whether anything may be attached. */
  resource: SchoolResource;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<unknown>(null);
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
      setError(null);
      void queryClient.invalidateQueries({
        queryKey: ["records", "files", subjectType, subjectId],
      });
    },
    onError: (cause) => setError(cause),
    onSettled: () => {
      if (input.current) input.current.value = "";
    },
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

      {error ? <SaveError what="That file" error={error} /> : null}

      {isPending ? (
        <TableRowsSkeleton rows={3} columns={[{ twoLine: true }, { width: 90 }]} />
      ) : files.length === 0 ? (
        <NothingYet
          title="Nothing attached"
          body="A birth certificate, a transfer letter, a medical note — anything that arrived on paper and belongs with this record."
        />
      ) : (
        <ul className="space-y-2">
          {files.map((file) => (
            <li key={file.id}>
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
  );
}
