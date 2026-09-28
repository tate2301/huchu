"use client";

import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Checkbox, toast } from "@corelithzw/react";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/api-client";
import { FileText, Globe, Upload } from "@/lib/icons";
import {
  RESOURCES_QUERY_KEY,
  fetchResourceLibrary,
  uploadResourceFile,
  type LibraryResourceRecord,
} from "@/lib/crm/resources-client";

/** The library as the builder offers it: live entries only. */
export function useResourceLibrary(enabled: boolean) {
  return useQuery({
    queryKey: [...RESOURCES_QUERY_KEY, "live"],
    queryFn: () => fetchResourceLibrary(),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * "For the client to review" — which of the library's resources go with this
 * document.
 *
 * Ticking is the whole interaction; the builder owns which ids are ticked and
 * what they start as (the defaults, or the ones the version being replaced
 * offered). A file that is not in the library yet can be uploaded from here,
 * which adds it to the library and ticks it, because the moment a rep
 * realises the client needs the site plan is the moment they are writing the
 * quote — not a detour through settings.
 */
export function ResourcePicker({
  library,
  isLoading,
  error,
  selected,
  onToggle,
}: {
  library: LibraryResourceRecord[];
  isLoading: boolean;
  error: unknown;
  selected: string[];
  /** One tick at a time, so an upload finishing late cannot undo a tick made meanwhile. */
  onToggle: (id: string, checked: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const resource = await uploadResourceFile(file);
      await queryClient.invalidateQueries({ queryKey: RESOURCES_QUERY_KEY });
      onToggle(resource.id, true);
      toast.success(`${resource.title} added and ticked`);
    } catch (uploadError) {
      toast.error("The file was not added", { description: getApiErrorMessage(uploadError) });
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <section className="space-y-2" aria-labelledby="doc-resources-heading">
      <div className="flex items-center justify-between gap-2">
        <h3 id="doc-resources-heading" className="text-sm font-semibold text-[var(--text-strong)]">
          For the client to review
        </h3>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={uploading}
          startIcon={<Upload aria-hidden="true" className="size-4" />}
          onClick={() => fileInput.current?.click()}
        >
          Upload a file
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : error ? (
        <p className="text-sm text-[var(--status-error-text)]" role="alert">
          The resource library would not load, so none will go with this document. It can still be
          saved.
        </p>
      ) : library.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Nothing in the library yet. Upload a file here, or add your brochures and links under CRM
          settings, Client resources.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--card-radius)] border border-[var(--border)]">
          {library.map((resource) => {
            const Icon = resource.kind === "FILE" ? FileText : Globe;
            return (
              <li key={resource.id} className="px-3 py-2">
                <Checkbox
                  checked={selected.includes(resource.id)}
                  onChange={(event) => onToggle(resource.id, event.target.checked)}
                  label={
                    <span className="flex min-w-0 items-start gap-2">
                      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--text-subtle)]" />
                      <span className="min-w-0">
                        <span className="block text-sm text-[var(--text-strong)]">{resource.title}</span>
                        {resource.description ? (
                          <span className="block text-sm text-[var(--text-muted)]">
                            {resource.description}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
