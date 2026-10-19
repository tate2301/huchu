import { fetchJson } from "@/lib/api-client";

/** What the upload answers, and what a record's route is handed to keep it. */
export type BooksFile = { url: string; name: string; contentType: string; size: number };

/** Store a file for a Books record (a supplier's invoice, a slip): the record's own route keeps it. In the browser. */
export async function uploadBooksFile(file: File): Promise<BooksFile> {
  const form = new FormData();
  form.append("file", file);
  return fetchJson<BooksFile>("/api/books/attachments", { method: "POST", body: form });
}
