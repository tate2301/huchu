import { fetchJson } from "@/lib/api-client";

import type { InboxModule } from "./describe";
import type { InboxDetail, InboxPage, InboxView } from "./query";

export type { InboxDetail, InboxItem, InboxPage, InboxView } from "./query";

export function fetchInbox(args: { view: InboxView; module?: InboxModule | null; page?: number; limit?: number }) {
  const params = new URLSearchParams({ view: args.view });
  if (args.module) params.set("module", args.module);
  if (args.page && args.page > 1) params.set("page", String(args.page));
  if (args.limit) params.set("limit", String(args.limit));
  return fetchJson<InboxPage>(`/api/inbox?${params.toString()}`);
}

export function fetchInboxDetail(id: string) {
  return fetchJson<InboxDetail>(`/api/inbox/${encodeURIComponent(id)}`);
}

export function markInboxRead(ids: string[]) {
  return fetchJson<{ updated: number }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify({ recipientIds: ids }),
  });
}

export function markAllInboxRead() {
  return fetchJson<{ updated: number }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify({ all: true }),
  });
}

export function archiveInbox(ids: string[]) {
  return fetchJson<{ updated: number }>("/api/notifications/archive", {
    method: "POST",
    body: JSON.stringify({ recipientIds: ids }),
  });
}
