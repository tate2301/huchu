/**
 * The client resource library, from the browser.
 *
 * Shared by the settings screen, which curates the library, and the document
 * builder, which offers it and can add a file to it on the spot.
 */
import { fetchJson } from "@/lib/api-client";
import type { LibraryResource } from "@/lib/crm/resources";

export type LibraryResourceRecord = LibraryResource & {
  contentType: string | null;
  /** How many documents have offered it. */
  documentCount: number;
};

export type ResourceLibraryResponse = { data: LibraryResourceRecord[]; canEdit: boolean };

/** Prefix: TanStack matches it, so one invalidation reaches both listings. */
export const RESOURCES_QUERY_KEY = ["crm", "resources"] as const;

export function fetchResourceLibrary({ withArchived = false }: { withArchived?: boolean } = {}) {
  return fetchJson<ResourceLibraryResponse>(
    `/api/v2/crm/resources${withArchived ? "?archived=1" : ""}`,
  );
}

/** "Floorcode brochure 2026.pdf" → "Floorcode brochure 2026". */
export function titleFromFileName(name: string): string {
  const withoutExtension = name.replace(/\.[a-z0-9]{1,5}$/i, "").trim();
  return (withoutExtension || name).slice(0, 160);
}

/**
 * Upload a file and add it to the library.
 *
 * Two requests, in this order, because the library row needs the address the
 * upload hands back. The upload answers with the stored file itself, not
 * wrapped in `data`.
 */
export async function uploadResourceFile(
  file: File,
  input: { title?: string; description?: string | null; isDefault?: boolean } = {},
): Promise<LibraryResourceRecord> {
  const body = new FormData();
  body.append("file", file);
  const stored = await fetchJson<{ url: string; pathname: string; contentType: string }>(
    "/api/v2/crm/uploads",
    { method: "POST", body },
  );
  const created = await fetchJson<{ resource: Omit<LibraryResourceRecord, "documentCount"> }>(
    "/api/v2/crm/resources",
    {
      method: "POST",
      body: JSON.stringify({
        kind: "FILE",
        title: input.title?.trim() || titleFromFileName(file.name),
        description: input.description ?? null,
        url: stored.url,
        pathname: stored.pathname,
        contentType: stored.contentType,
        isDefault: input.isDefault ?? false,
      }),
    },
  );
  return { ...created.resource, documentCount: 0 };
}
