"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import { X } from "@/lib/icons";
import { TILL_HEARTBEAT_KEY, useTillHeartbeat } from "./pos-device-watch";
import { usePosPortalState } from "./pos-portal-state";

/**
 * "Send a message" from Setup › Tills and devices, shown on the till as a
 * banner until someone at the till dismisses it (10-setup 5.5). Read from the
 * heartbeat the till already makes.
 */
export function PosTillMessages() {
  const queryClient = useQueryClient();
  const { paired } = usePosPortalState();
  const heartbeat = useTillHeartbeat(paired);
  const messages = heartbeat.data?.messages ?? [];
  const dismiss = useMutation({
    mutationFn: (id: string) => fetchJson(`/api/v2/retail/devices/messages/${id}/dismiss`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: TILL_HEARTBEAT_KEY }),
  });
  if (messages.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 pt-3 md:px-6 lg:px-8" role="status">
      {messages.map((message) => (
        <div
          key={message.id}
          className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--pos-status-warning-bg)", boxShadow: "inset 0 0 0 1px var(--pos-status-warning-ring)", color: "var(--text-strong)" }}
        >
          <div className="min-w-0 flex-1">
            <p className="whitespace-pre-line font-semibold">{message.body}</p>
            {message.from ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">From {message.from}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Dismiss the message"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate(message.id)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
