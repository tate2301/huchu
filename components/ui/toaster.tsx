"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { toast, useToasts, type ToastEntry } from "@corelithzw/react";

import { ToastCard } from "@/components/ui/toast";

/** Never changes, so the subscription never fires — this store is a constant. */
function subscribe() {
  return () => {};
}

const EDGE = 16;

/**
 * Where the toast sits: bottom-left of the main column, 16px in, and above
 * the element a page marks with `data-toast-floor` (a list's pager) when
 * there is one. Measured each time a toast appears, so it follows the shell
 * (panel open or collapsed) without the shell having to publish anything.
 */
function place(node: HTMLDivElement | null) {
  if (!node) return;
  const main = document.querySelector("main");
  const left = main ? Math.max(0, main.getBoundingClientRect().left) : 0;
  const floor = document.querySelector<HTMLElement>("[data-toast-floor]");
  const lift = floor ? Math.max(0, window.innerHeight - floor.getBoundingClientRect().top) : 0;
  node.style.left = `${left + EDGE}px`;
  node.style.bottom = `${lift + EDGE}px`;
}

function LiveToast({ entry }: { entry: ToastEntry }) {
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = React.useRef(entry.duration ?? 5000);
  const startedAt = React.useRef(0);

  const arm = React.useCallback(() => {
    if (!Number.isFinite(remaining.current) || timer.current) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => toast.dismiss(entry.id), remaining.current);
  }, [entry.id]);

  const pause = () => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
  };

  React.useEffect(() => {
    arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [arm]);

  return (
    <ToastCard
      tone={entry.tone}
      title={entry.title}
      description={entry.description}
      action={
        entry.action
          ? {
              label: entry.action.label,
              onClick: () => {
                entry.action?.onClick();
                toast.dismiss(entry.id);
              },
            }
          : undefined
      }
      onPointerEnter={pause}
      onPointerLeave={arm}
    />
  );
}

/**
 * Toaster — mounted once in `app-providers.tsx`. It reads the design
 * system's toast store (so `toast()` from `@corelithzw/react` and `useToast`
 * both land here) and shows one toast at a time: a new one replaces the old.
 *
 * The hydration gate is load-bearing: the server renders nothing, so the
 * client's first render must render nothing too, and the portal comes in on
 * the second.
 */
export function Toaster() {
  const hydrated = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const list = useToasts();
  const latest = list.at(-1);

  React.useEffect(() => {
    for (const older of list.slice(0, -1)) toast.dismiss(older.id);
  }, [list]);

  if (!hydrated || !latest) return null;

  return createPortal(
    <div key={latest.id} ref={place} className="cx-toast-host" aria-live="polite">
      <LiveToast entry={latest} />
    </div>,
    document.body,
  );
}
