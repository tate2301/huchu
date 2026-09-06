"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Alert, EmptyState } from "@corelithzw/react";
import { Button } from "@corelithzw/ui/components/button";
import { IconButton } from "@corelithzw/ui/components/icon-button";
import { Skeleton } from "@corelithzw/ui/components/skeleton";
import { useToast } from "@corelithzw/ui/components/use-toast";
import { fetchJson, getApiErrorMessage } from "@corelithzw/platform/api-client";
import { fileMark, formatFileSize } from "@/lib/crm/panels";
import type { FileOwnerKind } from "@/lib/crm/record-files";
import { ClientDate } from "@corelithzw/ui/components/client-date";
import { Download, Plus, Trash2 } from "@corelithzw/ui/lib/icons";

type RecordFile = {
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
 * The files that belong to this record.
 *
 * Quotes and invoices the system raised live in Documents; this is everything
 * that arrived from outside — the signed contract, the tax clearance, the
 * scan of a purchase order. Those used to live in whichever inbox received
 * them, which is a filing system with one member of staff.
 *
 * Uploading is two requests: the bytes go to blob storage first and the row
 * is written only once there is a url to write. The other order leaves a row
 * pointing at nothing, which reads as a file and opens as an error.
 */
export function FilesTab({
  owner,
  ownerId,
}: {
  owner: FileOwnerKind;
  ownerId: string;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const key = ["crm-record-files", owner, ownerId];

  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      fetchJson<{ data: RecordFile[] }>(
        `/api/v2/crm/files?owner=${owner}&ownerId=${ownerId}`,
      ),
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/api/v2/crm/files?id=${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: "File removed" });
    },
    onError: (error) =>
      toast({
        title: "Couldn't remove it",
        description: getApiErrorMessage(error),
        variant: "destructive",
      }),
  });

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const stored = await fetchJson<{ url: string; size?: number; contentType?: string }>(
        "/api/v2/crm/uploads",
        { method: "POST", body: form },
      );

      await fetchJson("/api/v2/crm/files", {
        method: "POST",
        body: JSON.stringify({
          owner,
          ownerId,
          name: file.name,
          url: stored.url,
          // The browser knows both; trust it over the server's guess at the
          // extension.
          size: file.size,
          contentType: file.type || null,
        }),
      });

      queryClient.invalidateQueries({ queryKey: key });
      toast({ title: "Attached", description: file.name });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: getApiErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const files = query.data?.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-muted)]">
          Contracts, certificates, scans — anything that arrived from outside.
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Plus className="size-4" />
          {uploading ? "Uploading…" : "Attach a file"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>

      {query.error ? (
        <Alert tone="danger" title="Couldn't load the files">
          {getApiErrorMessage(query.error)}
        </Alert>
      ) : null}

      {query.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : files.length === 0 ? (
        <EmptyState
          title="Nothing attached yet"
          body="Anything filed here stays with the record rather than in somebody's inbox."
        />
      ) : (
        <ul className="space-y-1">
          {files.map((file) => {
            const mark = fileMark(file.name);
            const size = formatFileSize(file.size);
            return (
              <li
                key={file.id}
                className="group flex items-center gap-3 rounded-[var(--radius-sm)] py-1.5 hover:bg-[var(--surface-hover)]"
              >
                <span
                  data-accent={mark.accent}
                  aria-hidden="true"
                  className="solid-mark flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] font-mono text-sm font-semibold"
                >
                  {mark.label}
                </span>

                <span className="min-w-0 flex-1">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-medium text-[var(--text-strong)] underline decoration-[var(--border)] underline-offset-2 hover:decoration-[var(--text)]"
                  >
                    {file.name}
                  </a>
                  <span className="block truncate text-sm text-[var(--text-muted)]">
                    {size ? `${size} · ` : ""}
                    <ClientDate value={file.createdAt} />
                    {file.uploadedBy?.name ? ` · ${file.uploadedBy.name}` : ""}
                    {file.note ? ` · ${file.note}` : ""}
                  </span>
                </span>

                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Download ${file.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:bg-[var(--surface-subtle)]"
                >
                  <Download className="size-4" />
                </a>

                <IconButton
                  size="sm"
                  aria-label={`Remove ${file.name}`}
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(file.id)}
                >
                  <Trash2 className="size-4 text-[var(--status-error-text)]" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
