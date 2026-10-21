"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Face } from "@/components/teams/face";
import { Glyph } from "@/components/teams/glyph";
import { OwnershipOffer } from "@/components/teams/members";
import { Teams } from "@/components/teams/teams-root";
import "@/components/teams/w-people.css";
import { Button } from "@/components/workspace/button";
import { acceptOwnershipAction, addSeatAction, declineOwnershipAction, notNowAction } from "@/app/preferences/organization/users/actions";
import type { Asks } from "@/lib/teams/asks";

/**
 * Needs you, the Teams rows: an offer of ownership and a request for a seat, each with its answers.
 * Slot: the W1 rows (approvals from the record page) mount here once their component is in components/teams.
 */
export function TeamsAsks() {
  const queryClient = useQueryClient();
  const asks = useQuery({
    queryKey: ["teams", "asks"],
    queryFn: async () => {
      const response = await fetch("/api/teams/asks");
      if (!response.ok) throw new Error("asks");
      return (await response.json()) as Asks;
    },
  });
  const [note, setNote] = React.useState<string | null>(null);
  const done = async (work: () => Promise<{ ok: boolean; message?: string }>, text: string) => {
    const result = await work();
    setNote(result.ok ? text : (result.message ?? "That did not go through. Nothing changed."));
    await queryClient.invalidateQueries({ queryKey: ["teams", "asks"] });
  };
  const data = asks.data;
  if (!data || (data.offers.length === 0 && data.seats.length === 0 && !note)) return null;
  return (
    <Teams>
      <div className="wp-asks" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "16px 0" }}>
        {data.offers.map((offer) => (
          <OwnershipOffer
            key={offer.id}
            from={{ id: offer.id, name: offer.fromName }}
            workspace={offer.workspace}
            moves={offer.moves}
            until={offer.until}
            onAccept={() => void done(() => acceptOwnershipAction(offer.id), `You own ${offer.workspace}`)}
            onDecline={() => void done(() => declineOwnershipAction(offer.id), "Offer declined")}
          />
        ))}
        {data.seats.map((request) => (
          <div key={request.ref} className="wp-ask">
            <div className="wp-ask__who">
              <Face person={{ name: request.askedBy }} size={28} />
              <div>
                <div style={{ color: "var(--ink)", fontWeight: 500 }}>
                  <b>{request.askedBy.split(" ")[0]}</b> asked for a seat for <b>{request.name}</b>
                </div>
                <div className="muted">{request.roleWord} · {request.price}</div>
              </div>
            </div>
            <div className="wp-ask__acts">
              <Button onClick={() => void done(() => notNowAction(request.ref), "Not now")}>Not now</Button>
              <Button variant="primary" icon={<Glyph name="user-plus" />} onClick={() => void done(() => addSeatAction(request.ref), `Seat added, invite sent to ${request.name.split(" ")[0]}`)}>Add the seat</Button>
            </div>
          </div>
        ))}
        {note ? <div className="muted" role="status">{note}</div> : null}
      </div>
    </Teams>
  );
}
