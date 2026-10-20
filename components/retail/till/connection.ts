"use client";

import * as React from "react";

/** Whether the line is up, and since when it has been down. */
export function useConnection() {
  const [online, setOnline] = React.useState(true);
  const [since, setSince] = React.useState<Date | null>(null);
  React.useEffect(() => {
    const update = () => {
      const now = navigator.onLine;
      setOnline(now);
      setSince((current) => (now ? null : (current ?? new Date())));
    };
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return { online, since };
}
