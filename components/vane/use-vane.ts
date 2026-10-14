"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { VaneCardDetail, VaneDone, VaneForYou, VaneMutedRow, VaneNav, VanePlanDetail } from "@/lib/vane/pages";
import type { VanePanel } from "@/lib/vane/panel";
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

/** Vane's own panel: the counts beside its rows and what it watches. */
export function useVaneNav() {
  return useQuery({
    queryKey: ["vane", "nav"],
    queryFn: () => fetchJson<VaneNav>("/api/vane/nav"),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** `/vane`: For you across every module, or one module's with `module`. */
export function useVaneForYou(module: string | null) {
  return useQuery({
    queryKey: ["vane", "home", module],
    queryFn: () => fetchJson<VaneForYou>(`/api/vane/home${module ? `?module=${encodeURIComponent(module)}` : ""}`),
    refetchInterval: 30_000,
  });
}

/** One card and what Vane read for it. */
export function useVaneCard(id: string | null) {
  return useQuery({
    queryKey: ["vane", "card", id],
    queryFn: () => fetchJson<VaneCardDetail>(`/api/vane/items/${encodeURIComponent(id ?? "")}`),
    enabled: Boolean(id),
  });
}

export function useVanePlans() {
  return useQuery({
    queryKey: ["vane", "plans"],
    queryFn: () => fetchJson<{ plans: VanePlanDetail[] }>("/api/vane/plans"),
    refetchInterval: 30_000,
  });
}

export function useVaneDone(search: string) {
  return useQuery({
    queryKey: ["vane", "done", search],
    queryFn: () => fetchJson<VaneDone>(`/api/vane/done${search ? `?${search}` : ""}`),
    placeholderData: (previous) => previous,
  });
}

export function useVaneMuted() {
  return useQuery({
    queryKey: ["vane", "muted"],
    queryFn: () => fetchJson<{ rows: VaneMutedRow[] }>("/api/vane/muted"),
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
  const giveJob = useMutation({
    mutationFn: (text: string) => fetchJson("/api/vane/jobs", { method: "POST", body: JSON.stringify({ text }) }),
    onSettled: refresh,
  });
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      fetchJson("/api/vane/settings", { method: "PATCH", body: JSON.stringify({ paused }) }),
    onSettled: refresh,
  });
  return { notNow, giveJob, pause };
}
