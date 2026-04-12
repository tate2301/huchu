"use client";

import { useEffect, useState } from "react";

export type OfflineConnectivityState = {
  isOffline: boolean;
  lastOnlineAt: string | null;
};

function browserIsOffline() {
  if (typeof navigator === "undefined") return false;
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
