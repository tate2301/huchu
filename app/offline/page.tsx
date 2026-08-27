"use client";

/**
 * The offline fallback — the page the service worker serves when a navigation
 * cannot reach the school's network.
 *
 * design/campus/spec/OfflinePage.html draws this screen twice, side by side.
 * As built — quoted on that artboard as
 * "— app/offline/page.tsx, in full" — it was a 40px spinner and nothing else:
 * a screen-reader user heard "Loading", nothing said the connection had gone,
 * nothing said whether their work had survived, and the spin never stopped.
 *
 * Proposed, the panel beside it, is what this file now renders, and it answers
 * the three questions somebody stranded mid-register actually has: what has
 * happened, what they can do about it, and what of theirs is safe. The last
 * one is not reassurance — it reads the outbox and lists the operations still
 * queued on this device, so "saved here" is a claim the page can back.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { getRecentConnectivityLogs } from "@/lib/offline/db-v2";
import { RefreshCw, WifiOff } from "@/lib/icons";
import { getOfflineOutboxSummary } from "@/lib/offline/outbox";
import type { OfflineOutboxSummaryItem } from "@/lib/offline/types";

const HEARTBEAT_URL = "/api/health";
const HEARTBEAT_TIMEOUT_MS = 6000;

/** Clock time, local to the device — the only form worth showing here. */
function clockTime(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Plain English for an outbox status, for people who never saw the enum. */
function describeStatus(item: OfflineOutboxSummaryItem) {
  if (item.blockedReason) return item.blockedReason;
  switch (item.status) {
    case "FAILED_BLOCKING":
      return "Needs attention before it can go up";
    case "FAILED_RETRYABLE":
      return "Will be tried again";
    case "SYNCING":
      return "Going up now";
    default:
      return "Waiting to go up";
  }
}

export default function OfflineFallbackPage() {
  const [waiting, setWaiting] = useState<OfflineOutboxSummaryItem[] | null>(null);
  const [lastConnectedAt, setLastConnectedAt] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);

  // What is actually on this device: the outbox, and the last heartbeat that
  // came back. Both are best-effort — a browser with IndexedDB blocked still
  // gets the page, just without the footer line.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [summary, logs] = await Promise.all([
        getOfflineOutboxSummary().catch(() => null),
        getRecentConnectivityLogs(50).catch(() => []),
      ]);
      if (cancelled) return;

      setWaiting(summary?.items ?? []);
      const lastGood = logs.find((entry) => entry.state !== "offline");
      setLastConnectedAt(lastGood?.timestamp ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // A retry that reloads without checking would land the person right back
  // here. Ask the health endpoint first, and only move if it answers.
  const tryAgain = useCallback(async () => {
    setRetrying(true);
    setRetryFailed(false);

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
      // Still nothing. Fall through to the notice below.
    } finally {
      clearTimeout(timeout);
    }

    setRetrying(false);
    setRetryFailed(true);
  }, []);

  const waitingCount = waiting?.length ?? 0;
  const lastConnectedLabel = lastConnectedAt ? clockTime(lastConnectedAt) : null;
  const footerParts: string[] = [];
  if (lastConnectedLabel) footerParts.push(`Last connected ${lastConnectedLabel}`);
  if (waiting) {
    footerParts.push(
      waitingCount === 0 ? "nothing waiting" : `${waitingCount} waiting to go up`,
    );
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-[var(--surface-canvas)] px-6 py-10"
      aria-labelledby="offline-title"
    >
      <div className="flex w-full max-w-[420px] flex-col items-center gap-3 text-center">
        <div
          className="flex size-13 items-center justify-center rounded-[13px] bg-[var(--status-warning-bg)] text-[var(--status-warning-text)]"
          aria-hidden="true"
        >
          <WifiOff className="size-6" />
        </div>

        <h1 id="offline-title" className="text-page-title text-foreground">
          No connection
        </h1>

        <div className="space-y-4 text-sm leading-relaxed text-muted-foreground">
          <p>
            This page needs the school&rsquo;s network, and there is no copy of
            it on this device.
          </p>
          <p>
            Anything you had already marked is saved here and goes up on its own
            when you are back.
          </p>
        </div>

        <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={tryAgain} disabled={retrying}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {retrying ? "Trying…" : "Try again"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowSaved((open) => !open)}
            aria-expanded={showSaved}
            aria-controls="offline-saved-here"
          >
            What is saved here
          </Button>
        </div>

        <p aria-live="polite" className="min-h-4 text-xs text-muted-foreground">
          {retryFailed
            ? "Still nothing. The network has not come back yet."
            : footerParts.length > 0
              ? footerParts.join(" · ")
              : ""}
        </p>

        {showSaved ? (
          <section
            id="offline-saved-here"
            className="mt-1 w-full rounded-lg border border-border bg-card p-4 text-left"
            aria-label="What is saved here"
          >
            {waiting === null ? (
              <p className="text-xs text-muted-foreground">
                Reading what is on this device.
              </p>
            ) : waiting.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing is waiting. Everything done on this device has already
                gone up.
              </p>
            ) : (
              <ul className="space-y-3">
                {waiting.map((item) => (
                  <li key={item.operationId} className="space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {describeStatus(item)}
                      {clockTime(item.createdAt)
                        ? ` · kept since ${clockTime(item.createdAt)}`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
