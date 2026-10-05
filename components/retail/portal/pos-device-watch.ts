"use client";

import { useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { ApiError, fetchJson } from "@/lib/api-client";
import { listOfflineRetailOperations } from "@/lib/retail/offline-runtime";

/**
 * The till noticing it is no longer a till (10-setup W-76).
 *
 * Every POS route answers 401 `DEVICE_UNPAIRED` once a manager unpairs this
 * device or pairs another to its till, and 409 `NOT_A_TILL` when it never was
 * one. The first such answer, from any query or mutation, ends the session
 * here: what the device held offline is sent first (`pos/sync` still takes
 * sales made before the unpairing, flagged for a manager), then the person is
 * signed out and the device shows /unpaired with how many went — or /pair.
 */

type DeviceRefusal = "DEVICE_UNPAIRED" | "NOT_A_TILL";

function refusalOf(error: unknown): DeviceRefusal | null {
  if (!(error instanceof ApiError)) return null;
  const code = (error.details as { code?: unknown } | undefined)?.code;
  if (error.status === 401 && code === "DEVICE_UNPAIRED") return "DEVICE_UNPAIRED";
  if (error.status === 409 && code === "NOT_A_TILL") return "NOT_A_TILL";
  return null;
}

export type TillMessage = { id: string; body: string; from: string; at: string };

/** How often the till calls in: last seen, and the back office's messages. */
const HEARTBEAT_MS = 60_000;

export const TILL_HEARTBEAT_KEY = ["till-heartbeat"] as const;

/** The heartbeat, shared by the watch and the message banner. */
export function useTillHeartbeat() {
  return useQuery({
    queryKey: TILL_HEARTBEAT_KEY,
    queryFn: () => fetchJson<{ messages: TillMessage[] }>("/api/v2/retail/devices/heartbeat", { method: "POST", body: "{}" }),
    refetchInterval: HEARTBEAT_MS,
    refetchIntervalInBackground: true,
    retry: false,
  });
}

export function usePosDeviceWatch(isPosHost: boolean) {
  const queryClient = useQueryClient();
  const { syncNow, tenantKey } = useOfflineRuntime();
  const leaving = useRef(false);
  // Keep calling in while the till is open.
  useTillHeartbeat();

  useEffect(() => {
    const base = isPosHost ? "" : "/portal/pos";
    const leave = async (refusal: DeviceRefusal) => {
      if (leaving.current) return;
      leaving.current = true;
      if (refusal === "NOT_A_TILL") {
        await signOut({ redirect: false });
        window.location.assign(`${base}/pair`);
        return;
      }
      const held = async () => (tenantKey ? (await listOfflineRetailOperations(tenantKey)).length : 0);
      const before = await held();
      if (before > 0) {
        try {
          await syncNow({ force: true });
        } catch {
          // What could not be sent stays queued on this device.
        }
      }
      const sent = Math.max(0, before - (await held()));
      await signOut({ redirect: false });
      window.location.assign(`${base}/unpaired${sent > 0 ? `?sent=${sent}` : ""}`);
    };
    const check = (error: unknown) => {
      const refusal = refusalOf(error);
      if (refusal) void leave(refusal);
    };
    const queries = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") check(event.action.error);
    });
    const mutations = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.action.type === "error") check(event.action.error);
    });
    return () => {
      queries();
      mutations();
    };
  }, [isPosHost, queryClient, syncNow, tenantKey]);
}
