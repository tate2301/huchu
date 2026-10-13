"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { VanePanel } from "@/lib/vane/panel";
import type { VaneWatchable } from "@/lib/vane/settings";
import type { VaneStatus } from "@/lib/vane/status";

/** The module a path belongs to, for "this module's cards first". */
export function moduleForPath(pathname: string): string | null {
  const first = pathname.split("/")[1] ?? "";
  const map: Record<string, string> = {
    accounting: "books",
    books: "books",
    crm: "crm",
    retail: "retail",
    reports: "reports",
    people: "people",
    payroll: "payroll",
    schools: "schools",
    gold: "gold",
  };
  return map[first] ?? null;
}

const STATUS_KEY = ["vane", "status"] as const;

/** The button's count and live dot; polled until the live channel carries it. */
export function useVaneStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => fetchJson<VaneStatus>("/api/vane/status"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useVanePanel(module: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["vane", "panel", module],
    queryFn: () => fetchJson<VanePanel>(`/api/vane/panel${module ? `?module=${encodeURIComponent(module)}` : ""}`),
    enabled,
    refetchInterval: enabled ? 15_000 : false,
  });
}

/** For you (`/vane`): every module's cards, the jobs it is on, its plans and what it finished today. */
export function useVaneForYou() {
  return useQuery({
    queryKey: ["vane", "for-you"],
    queryFn: () => fetchJson<VanePanel>("/api/vane/panel?today=1"),
    refetchInterval: 15_000,
  });
}

/** What Vane watches in this workspace (Management → Vane), for the panel's Watching. */
export function useVaneWatching() {
  return useQuery({
    queryKey: ["vane", "settings"],
    queryFn: () =>
      fetchJson<{ settings: { watches: Record<string, boolean> }; watchables: VaneWatchable[] }>("/api/vane/settings"),
    staleTime: 60_000,
    select: (data) => data.watchables.filter((module) => data.settings.watches[module.key] !== false),
  });
}

export function useVaneActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ["vane"] });
  const notNow = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      fetchJson(`/api/vane/items/${id}/mute`, { method: "POST", body: JSON.stringify({ reason }) }),
    onSettled: refresh,
  });
  /** The card's act was pressed: it goes to Done with this person's name. */
  const act = useMutation({
    mutationFn: ({ id }: { id: string }) => fetchJson(`/api/vane/items/${id}/act`, { method: "POST" }),
    onSettled: refresh,
  });
  const giveJob = useMutation({
    mutationFn: (text: string) => fetchJson("/api/vane/jobs", { method: "POST", body: JSON.stringify({ text }) }),
    onSettled: refresh,
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      fetchJson("/api/vane/settings", { method: "PATCH", body: JSON.stringify({ paused }) }),
    onSettled: refresh,
  });
  return { notNow, act, giveJob, pause };
}
