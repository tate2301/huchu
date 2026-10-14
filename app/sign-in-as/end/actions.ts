"use server";

import { endSignInAsByOwnerLink } from "@/lib/sign-in-as/sessions";

export type OwnerEndState = { kind: "ended" | "already-over" | "unknown"; code?: string; workspace?: string } | null;

/** The owner's "end it", from the link in their email. Holding the link is the authority. */
export async function endFromOwnerLink(_: OwnerEndState, form: FormData): Promise<OwnerEndState> {
  return endSignInAsByOwnerLink(String(form.get("token") ?? ""));
}
