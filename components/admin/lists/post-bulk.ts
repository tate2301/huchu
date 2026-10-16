import type { BulkAnswer } from "@/lib/admin/lists/words";
import { doneWords } from "@/lib/admin/lists/words";

/** POSTs a bulk body and answers the toast's words; throws the server's refusal for the sheet to show. */
export async function postBulk(
  endpoint: string,
  body: Record<string, unknown>,
  past: string,
  noun: [string, string],
): Promise<{ title: string; variant: "success" | "warning" }> {
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const answer = (await response.json().catch(() => null)) as (BulkAnswer & { error?: string }) | null;
  if (!response.ok) throw new Error(answer?.error ?? "That did not work. Nothing was changed; try again.");
  const words = doneWords(answer, past, noun);
  return typeof words === "string" ? { title: words, variant: "success" } : words;
}
