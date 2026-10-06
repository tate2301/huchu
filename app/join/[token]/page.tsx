import type { Metadata } from "next";

import { JoinCard } from "./join-card";

export const metadata: Metadata = { title: "Join" };

/**
 * Joining a shop by the WhatsApp link (80-admin 5.6, W-57 "They join"): a
 * public page on the shop's own host, outside the shell. The token in the
 * address is the capability; nothing here needs a session.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <JoinCard token={token} />;
}
