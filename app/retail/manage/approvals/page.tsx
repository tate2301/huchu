"use client";

import "./approvals.css";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { SettingsFrame } from "@/components/settings-frame/settings-frame";
import { Button } from "@/components/workspace/button";
import { fetchJson, getApiErrorMessage } from "@/lib/api-client";
import type { WaitingAnswer } from "@/lib/retail/approvals/waiting";
import { WAITING_QUERY_KEY } from "@/lib/retail/approvals/words";

/**
 * Management › Approvals (W-58, board ApprovalSettings): when the owner must
 * say yes and how they are asked, on the SettingsFrame, with what is waiting
 * now in the aside. Owners change it; managers and the bookkeeper read it.
 */
export default function ApprovalSettingsPage() {
  return <SettingsFrame page="approvals" slots={() => ({ waiting: <WaitingNow /> })} />;
}

function WaitingNow() {
  const query = useQuery({
    queryKey: WAITING_QUERY_KEY,
    queryFn: () => fetchJson<WaitingAnswer>("/api/v2/retail/approvals/waiting"),
    refetchInterval: 60_000,
  });

  if (query.isPending) return <p className="cx-ap-muted">Loading…</p>;
  if (query.isError) {
    return (
      <p role="alert" className="cx-ap-bad">
        {getApiErrorMessage(query.error, "What is waiting did not load.")}{" "}
        <Button onClick={() => void query.refetch()}>Try again</Button>
      </p>
    );
  }
  const { items, more } = query.data;
  if (items.length === 0) return <p>Nothing is waiting.</p>;
  return (
    <ul>
      {items.map((item) => (
        <li key={item.key}>
          <span>
            <Link className="cx-ap-ref" href={item.href}>
              {item.ref}
            </Link>
            {item.text.slice(item.ref.length)}
          </span>
        </li>
      ))}
      {more > 0 ? (
        <li>
          <span>and {more} more</span>
        </li>
      ) : null}
    </ul>
  );
}
