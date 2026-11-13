"use client";

/**
 * The offline fallback — the page the service worker serves when a navigation
 * cannot reach the network and no copy of the page is on this device.
 *
 * It answers what somebody stranded here needs: that the page is not here,
 * since when the line has been down, which pages are, and what of their work
 * is waiting. The waiting list reads the outbox, so it is a claim the page can
 * back.
 */

import { useCallback, useEffect, useState } from "react";
import { formatSyncTime, queueRowWord } from "@/components/layout/offline-runtime-panel";
import { useOfflineRuntime } from "@/components/offline/offline-runtime";
import { Button } from "@/components/ui/button";
import { RefreshCw, WifiOff } from "@/lib/icons";
import { getOfflineOutboxSummary } from "@/lib/offline/outbox";
import { OFFLINE_PAGE_CACHE } from "@/lib/offline/service-worker-protocol";
import type { OfflineOutboxSummaryItem } from "@/lib/offline/types";

/**
 * The v2 route, because it is the one that exists. It needs no auth, so it
 * answers even when the session is the thing that expired.
 */
const HEARTBEAT_URL = "/api/v2/health";
const HEARTBEAT_TIMEOUT_MS = 6000;

type KeptPage = { href: string; name: string };

/** "/retail/till-rules" → "Retail · Till rules". */
function pageName(pathname: string) {
  const words = pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/-/g, " "))
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1));
  return words.join(" · ");
}

async function readKeptPages(): Promise<KeptPage[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(OFFLINE_PAGE_CACHE);
  const paths = new Set((await cache.keys()).map((request) => new URL(request.url).pathname));
  paths.delete("/");
  paths.delete("/offline");
  return [...paths]
    .sort()
    .map((href) => ({ href, name: pageName(href) }))
    .filter((page) => page.name !== "");
}

export default function OfflineFallbackPage() {
  const [waiting, setWaiting] = useState<OfflineOutboxSummaryItem[]>([]);
  const [kept, setKept] = useState<KeptPage[]>([]);
  // Recorded by the offline runtime the moment the line went, and kept on the
  // device, so it survives the reload that landed here.
  const { lastOnlineAt } = useOfflineRuntime();
  const [retrying, setRetrying] = useState(false);

  // What is actually on this device. Best-effort — a browser with IndexedDB or
  // Cache Storage blocked still gets the page, just without the lists.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [summary, pages] = await Promise.all([
        getOfflineOutboxSummary().catch(() => null),
        readKeptPages().catch(() => []),
      ]);
      if (cancelled) return;
      setWaiting(summary?.items ?? []);
      setKept(pages);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // A retry that reloads without checking would land the person right back
  // here. Ask the health endpoint first, and only move if it answers.
  const tryAgain = useCallback(async () => {
    setRetrying(true);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);

    try {
      const response = await fetch(HEARTBEAT_URL, {
        method: "HEAD",
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.ok) {
        // The address bar still holds the page they asked for — the worker
        // swapped the body, not the URL — so a reload takes them there. Only
        // somebody who typed /offline needs sending somewhere.
        if (window.location.pathname === "/offline") {
          window.location.assign("/");
        } else {
          window.location.reload();
        }
        return;
      }
    } catch {
      // Still nothing.
    } finally {
      clearTimeout(timeout);
    }

    setRetrying(false);
  }, []);

  const since = formatSyncTime(lastOnlineAt);

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] px-6 py-10"
      aria-labelledby="offline-title"
    >
      <div className="flex w-full max-w-[420px] flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex size-13 items-center justify-center rounded-[13px] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"
            aria-hidden="true"
          >
            <WifiOff className="size-6" />
          </div>
          <h1 id="offline-title" className="text-page-title text-foreground">
            Not on this device
          </h1>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            No connection{since ? ` since ${since}` : ""}
          </p>
        </div>

        {kept.length > 0 ? (
          <section aria-labelledby="offline-kept" className="flex flex-col gap-2">
            <h2 id="offline-kept" className="text-xs font-medium text-muted-foreground">
              Kept pages
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {kept.map((page) => (
                <li key={page.href}>
                  <a href={page.href} className="block px-4 py-2.5 text-sm text-foreground hover:bg-muted">
                    {page.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {waiting.length > 0 ? (
          <section aria-labelledby="offline-waiting" className="flex flex-col gap-2">
            <h2 id="offline-waiting" className="text-xs font-medium text-muted-foreground">
              Waiting on this device · {waiting.length}
            </h2>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {waiting.map((item) => (
                <li key={item.operationId} className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {item.status === "FAILED_BLOCKING" ? "Needs review" : queueRowWord(item)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="flex justify-center">
          <Button onClick={tryAgain} disabled={retrying}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {retrying ? "Trying…" : "Try again"}
          </Button>
        </div>
      </div>
    </main>
  );
}
