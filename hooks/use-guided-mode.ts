"use client";

import { useCallback, useEffect, useState } from "react";

const GUIDED_MODE_KEY = "guided-mode-enabled";
const GUIDED_MODE_EVENT = "guided-mode-changed";

function readGuidedMode() {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(GUIDED_MODE_KEY);
  if (stored === null) return true;
  return stored === "true";
}

export function useGuidedMode() {
  const [enabled, setEnabled] = useState(() => readGuidedMode());

  useEffect(() => {
    const sync = () => setEnabled(readGuidedMode());
    window.addEventListener("storage", sync);
    window.addEventListener(GUIDED_MODE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(GUIDED_MODE_EVENT, sync);
    };
  }, []);

  const setGuidedMode = useCallback((next: boolean) => {
    setEnabled(next);
    if (typeof window === "undefined") return;
    window.localStorage.setItem(GUIDED_MODE_KEY, String(next));
    window.dispatchEvent(new Event(GUIDED_MODE_EVENT));
  }, []);

  return { enabled, setGuidedMode };
}
