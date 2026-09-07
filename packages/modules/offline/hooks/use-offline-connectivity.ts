"use client";

import { useEffect, useState } from "react";

export type OfflineConnectivityState = {
  isOffline: boolean;
  lastOnlineAt: string | null;
};

/**
 * Whether the *browser* says it is offline.
 *
 * The guard is on `onLine`, not on `navigator`. Node 18 and later define a
 * global `navigator` — it carries `userAgent` and little else — so the old
 * `typeof navigator === "undefined"` check passed on the server, `onLine` came
 * back `undefined`, and `!undefined` made every server render believe the
 * machine was offline. The client then rendered the app, React saw two
 * different trees and threw the page away on hydration. It happened on every
 * authenticated route in the app.
 */
function browserIsOffline() {
  if (typeof navigator === "undefined" || typeof navigator.onLine !== "boolean") {
    return false;
  }
  return !navigator.onLine;
}

export function useOfflineConnectivity() {
  const [state, setState] = useState<OfflineConnectivityState>({
    isOffline: browserIsOffline(),
    lastOnlineAt: browserIsOffline() ? null : new Date().toISOString(),
  });

  useEffect(() => {
    const onOnline = () => {
      setState({
        isOffline: false,
        lastOnlineAt: new Date().toISOString(),
      });
    };
    const onOffline = () => {
      setState((current) => ({
        ...current,
        isOffline: true,
      }));
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  return state;
}
