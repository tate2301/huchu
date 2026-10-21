import type { Metadata } from "next";

import { loadJoin, loadLinkJoin } from "@/lib/teams/join-view";

import { JoinCard } from "./join-card";
import { JoinLink } from "./join-link";
import { JoinPerson } from "./join-person";

export const metadata: Metadata = { title: "Join" };

/**
 * An invite to a workspace (Teams): the six digits sent to the number it went to, then in. A token that is not
 * a workspace invite is a shop's staff link, which keeps the card it always had. Public: the token is the
 * capability.
 */
export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadJoin(token);
  if (view) return <JoinPerson token={token} view={view} />;
  const link = await loadLinkJoin(token);
  return link ? <JoinLink token={token} view={link} /> : <JoinCard token={token} />;
}
