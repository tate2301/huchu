"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchJson } from "@/lib/api-client";
import type { VaneActionView } from "@/lib/vane/actions/engine";
import type { ChatEvent, VaneChatMessage } from "@/lib/vane/chat";
import type { VaneDoneView, VaneMutedRow, VanePlanRow, VaneWorkRow } from "@/lib/vane/lists";
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

/**
 * The button's count and live dot. The live stream (`app/api/live`) reads it
 * again whenever Vane moves; the slow poll is only for a dropped connection.
 */
export function useVaneStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: () => fetchJson<VaneStatus>("/api/vane/status"),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useVanePanel(module: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["vane", "panel", module],
    queryFn: () => fetchJson<VanePanel>(`/api/vane/panel${module ? `?module=${encodeURIComponent(module)}` : ""}`),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
}

/** For you (`/vane`): every module's cards, the jobs it is on, its plans and what it finished today. */
export function useVaneForYou() {
  return useQuery({
    queryKey: ["vane", "for-you"],
    queryFn: () => fetchJson<VanePanel>("/api/vane/panel?today=1"),
    refetchInterval: 60_000,
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

export function useVanePlans() {
  return useQuery({
    queryKey: ["vane", "plans"],
    queryFn: () => fetchJson<{ plans: VanePlanRow[] }>("/api/vane/plans").then((data) => data.plans),
    refetchInterval: 60_000,
  });
}

export function useVaneDone(days: number, template: string | null) {
  const query = new URLSearchParams({ days: String(days), ...(template ? { template } : {}) });
  return useQuery({
    queryKey: ["vane", "done", days, template],
    queryFn: () => fetchJson<VaneDoneView>(`/api/vane/done?${query.toString()}`),
    placeholderData: (previous) => previous,
  });
}

export function useVaneWorking() {
  return useQuery({
    queryKey: ["vane", "working"],
    queryFn: () => fetchJson<{ jobs: VaneWorkRow[] }>("/api/vane/working").then((data) => data.jobs),
    refetchInterval: 60_000,
  });
}

export function useVaneMuted() {
  return useQuery({
    queryKey: ["vane", "muted"],
    queryFn: () => fetchJson<{ cards: VaneMutedRow[] }>("/api/vane/muted").then((data) => data.cards),
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
  const pause = useMutation({
    mutationFn: (paused: boolean) =>
      fetchJson("/api/vane/settings", { method: "PATCH", body: JSON.stringify({ paused }) }),
    onSettled: refresh,
  });
  /** Bring back: a muted card goes back to For you. */
  const unmute = useMutation({
    mutationFn: ({ id }: { id: string }) => fetchJson(`/api/vane/items/${id}/unmute`, { method: "POST" }),
    onSettled: refresh,
  });
  /** A person ticks one of their own steps in a plan, or unticks it. */
  const tick = useMutation({
    mutationFn: ({ planId, stepId, done }: { planId: string; stepId: string; done: boolean }) =>
      fetchJson(`/api/vane/plans/${planId}/steps/${stepId}`, { method: "PATCH", body: JSON.stringify({ done }) }),
    onSettled: refresh,
  });
  return { notNow, act, pause, unmute, tick };
}

const CHAT_KEY = ["vane", "chat"] as const;

/** This person's conversation with Vane. */
export function useVaneChat(enabled = true) {
  return useQuery({
    queryKey: CHAT_KEY,
    queryFn: () => fetchJson<{ messages: VaneChatMessage[] }>("/api/vane/chat").then((data) => data.messages),
    enabled,
  });
}

/**
 * Asks Vane, and holds the panel while it answers: `working` says what Vane
 * is doing now, from the turn's stream; the person's words show at once, the
 * answer when it lands; `error` says why there is none.
 */
export function useVaneAsk() {
  const client = useQueryClient();
  const [working, setWorking] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const ask = React.useCallback(
    async (text: string, module: string | null) => {
      setError(null);
      setWorking("Reading your question");
      const mine: VaneChatMessage = { id: `mine-${Date.now()}`, author: "person", text, createdAt: new Date().toISOString(), actions: [] };
      client.setQueryData<VaneChatMessage[]>(CHAT_KEY, (messages) => [...(messages ?? []), mine]);
      try {
        const response = await fetch("/api/vane/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, module }),
        });
        if (!response.ok || !response.body) {
          const payload = await response.json().catch(() => null);
          throw new Error((payload as { error?: string } | null)?.error ?? "Vane could not be asked. Try again.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ChatEvent;
            if (event.type === "working") setWorking(event.label);
            else if (event.type === "error") setError(event.error);
            else client.setQueryData<VaneChatMessage[]>(CHAT_KEY, (messages) => [...(messages ?? []), event.message]);
          }
        }
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Vane could not be asked. Try again.");
      } finally {
        setWorking(null);
        void client.invalidateQueries({ queryKey: ["vane"] });
      }
    },
    [client],
  );

  return { ask, working, error, clearError: () => setError(null) };
}

/** A person approves one of Vane's actions (with the inputs they changed) or denies it. */
export function useDecideAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...decision }: { id: string } & ({ approve: false } | { approve: true; changes?: Record<string, unknown> })) =>
      fetchJson<{ action: VaneActionView }>(`/api/vane/actions/${id}`, { method: "POST", body: JSON.stringify(decision) }),
    onSettled: () => client.invalidateQueries({ queryKey: ["vane"] }),
  });
}
